import { MessageFlags, type Client, type Message, type MessageCreateOptions, type MessageEditOptions, type SendableChannels } from "discord.js";

interface PanelOptions {
  matches: (message: Message) => boolean;
  payload: MessageCreateOptions | (() => MessageCreateOptions);
  editPayload?: MessageEditOptions;
  renderKey?: string;
  forceRefresh?: boolean;
  keepOldest?: boolean;
  removeDuplicates?: boolean;
}

function unknownMessage(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 10008;
}

async function publishPersistentPanel(client: Client, channel: SendableChannels, panelKey: string, options: PanelOptions): Promise<void> {
  if (!client.user) throw new Error("Cannot publish a persistent panel before Discord is ready.");
  if (!client.panelStorage) throw new Error("Persistent panels require DATABASE_URL; publication is paused to prevent duplicates.");
  const botId = client.user.id;
  const isOwnPanel = (message: Message): boolean => message.author.id === botId && !message.webhookId && options.matches(message);
  await client.panelStorage.withPanel(channel.id, panelKey, async (session) => {
    let stored = await session.get();
    let existing: Message | undefined;
    if (!stored) {
      // Import once, including panels buried beneath normal channel traffic.
      const matches: Message[] = [];
      let before: string | undefined;
      for (let page = 0; ; page++) {
        if (page === 100) throw new Error(`Panel ${panelKey} discovery exceeded 10,000 messages; publication paused.`);
        const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        matches.push(...messages.filter(isOwnPanel).values());
        if (messages.size < 100) break;
        before = messages.last()!.id;
      }
      existing = options.keepOldest ? matches.at(-1) : matches[0];
      // Finish optional legacy cleanup before completing the import so failures retry safely.
      if (options.removeDuplicates) {
        for (const duplicate of matches) {
          if (duplicate.id !== existing?.id) await duplicate.delete();
        }
      }
      await session.save(existing?.id ?? null);
      stored = { messageId: existing?.id ?? null, renderKey: null };
    } else if (stored.messageId) {
      try { existing = await channel.messages.fetch({ message: stored.messageId, force: true }); }
      catch (error) {
        if (!unknownMessage(error)) throw error;
      }
      if (existing && !isOwnPanel(existing)) throw new Error(`Stored ${panelKey} message is not a recognized panel owned by this bot.`);
    }

    if (existing && options.renderKey !== undefined && stored.renderKey === options.renderKey && !options.forceRefresh) return;
    const source = typeof options.payload === "function" ? options.payload() : options.payload;
    const payload = { ...source, allowedMentions: source.allowedMentions ?? { parse: [] as const } };
    if (existing) {
      try {
        await existing.edit(options.editPayload ?? {
          content: payload.content ?? null, embeds: payload.embeds ?? [], attachments: [],
          components: payload.components ?? [], files: payload.files,
          flags: payload.flags === MessageFlags.IsComponentsV2 ? MessageFlags.IsComponentsV2 : undefined,
          allowedMentions: payload.allowedMentions,
        });
        await session.save(existing.id, options.renderKey);
        return;
      } catch (error) {
        if (!unknownMessage(error)) throw error;
      }
    }
    // Only a confirmed deletion permits replacement; permission/network errors stop publication.
    const message = await channel.send(payload);
    await session.save(message.id, options.renderKey);
  });
}

export { publishPersistentPanel };
export type { PanelOptions };
