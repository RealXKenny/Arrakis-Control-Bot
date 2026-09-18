import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client, type Message, type MessageCreateOptions } from "discord.js";
import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { createLogger } from "../../../client/logger";

const STORM_DURATION_MS = 24 * 60 * 60 * 1000;
const logger = createLogger("CORIOLIS STORM");

export function readStormChannelId(env: NodeJS.ProcessEnv = process.env): string | null {
  const channelId = env.STORM_CHANNEL_ID?.trim();
  if (!channelId) return null;
  if (!/^\d{17,20}$/.test(channelId)) throw new Error("STORM_CHANNEL_ID must be a valid Discord channel ID.");
  return channelId;
}

export function parseCoriolisEnd(response: unknown): number {
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("The map markers API returned an invalid response.");
  const value = (response as Record<string, unknown>).coriolisNextCycleAt;
  let end: number;
  if (typeof value === "number") end = value < 10_000_000_000 ? value * 1000 : value;
  else if (typeof value === "string" && value.trim()) end = Date.parse(value);
  else throw new Error("The map markers API did not return coriolisNextCycleAt.");
  if (!Number.isFinite(end)) throw new Error("The map markers API returned an invalid coriolisNextCycleAt value.");
  return end;
}

export function stormWindowFromEnd(end: number): { start: number; end: number } {
  return { start: end - STORM_DURATION_MS, end };
}

export function buildStormPanel(start: number, end: number, now = Date.now()): MessageCreateOptions {
  const starts = Math.floor(start / 1000);
  const ends = Math.floor(end / 1000);
  const active = now >= start && now < end;
  const ended = now >= end;
  const filename = "coriolis-storm.png";
  const banner = createDuneBanner({ filename, title: "Coriolis Storm", subtitle: "DEEP DESERT WATCH", detail: "PLAN YOUR JOURNEY. KNOW THE STORM." });
  const card = new ContainerBuilder()
    .setAccentColor(active ? 0xd05c3c : 0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${filename}`).setDescription("Coriolis Storm — Dune: Awakening storm announcement")))
    .addTextDisplayComponents((text) => text.setContent(`## Coriolis Storm Schedule\n${ended ? "◌ **Awaiting the next cycle**" : active ? "🔴 **Storm underway**" : "🟡 **Next storm approaching**"}`))
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(ended ? "The last scheduled storm has ended. The next schedule will appear here automatically." :
      active ? `### Storm clears <t:${ends}:R>\nTake shelter and plan your next expedition.` : `### Arrives <t:${starts}:R>\nFinish your expedition and prepare for the storm.`))
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(`### ${ended ? "Last storm" : "Your storm window"}\n**Begins**\n<t:${starts}:F>\n\n**Clears**\n<t:${ends}:F>`));
  return { components: [card], files: [banner], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export function createStormAnnouncer(client: Client, channelId: string): (now?: number) => Promise<void> {
  let busy = false;
  let messageId: string | undefined;
  let renderedKey: string | undefined;
  return async (now = Date.now()): Promise<void> => {
    if (busy || !client.user || (process.env.DISCORD_SHARD_ID ?? "0") !== "0") return;
    busy = true;
    try {
      const response = await client.duneApi.call("GET", "/api/map/markers", { query: { static: 0 } });
      const window = stormWindowFromEnd(parseCoriolisEnd(response));
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) throw new Error(`Storm announcement channel ${channelId} is not sendable.`);
      let existing: Message | undefined;
      if (messageId) {
        try { existing = await channel.messages.fetch(messageId); }
        catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === 10008)) throw error;
          messageId = undefined;
          renderedKey = undefined;
        }
      }
      if (!existing) {
        const panels: Message[] = [];
        let before: string | undefined;
        for (let page = 0; ; page++) {
          if (page === 100) throw new Error("Storm panel discovery exceeded 10,000 messages.");
          const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
          panels.push(...messages.filter((message) => message.author.id === client.user!.id &&
            /Coriolis Storm Schedule|Coriolis end \d+/.test(JSON.stringify(message.components))).values());
          if (messages.size < 100) break;
          before = messages.last()!.id;
        }
        existing = panels.pop();
        for (const duplicate of panels) await duplicate.delete();
      }
      const key = `${window.end}:${now < window.start ? "upcoming" : now < window.end ? "active" : "ended"}`;
      if (existing) {
        if (renderedKey !== key) {
          const panel = buildStormPanel(window.start, window.end, now);
          await existing.edit({ components: panel.components, files: panel.files, attachments: [],
            flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, content: null, embeds: [] });
        }
      } else existing = await channel.send(buildStormPanel(window.start, window.end, now));
      messageId = existing.id;
      renderedKey = key;
    } finally {
      busy = false;
    }
  };
}

export function startStormAnnouncements(client: Client): NodeJS.Timeout | undefined {
  const channelId = readStormChannelId();
  if (!channelId || (process.env.DISCORD_SHARD_ID ?? "0") !== "0") return;
  const announce = createStormAnnouncer(client, channelId);
  const tick = (): void => { void announce().catch((error: unknown) => logger.error("Unable to update the Coriolis storm panel; will retry.", error)); };
  tick();
  return setInterval(tick, 60_000);
}
