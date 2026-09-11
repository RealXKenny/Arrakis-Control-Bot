import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client, type MessageCreateOptions } from "discord.js";
import { createDuneBanner } from "../../shared/factories/imageFactory";
import { createLogger } from "../../client/logger";

const STORM_DURATION_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;
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

export function buildStormPanel(start: number, end: number): MessageCreateOptions {
  const starts = Math.floor(start / 1000);
  const ends = Math.floor(end / 1000);
  const filename = `coriolis-${ends}.png`;
  const banner = createDuneBanner({ filename, title: "Coriolis Storm", subtitle: "CURRENT CYCLE", detail: "LIVE CONSOLE SCHEDULE | ARRAKIS CONTROL" });
  const card = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${filename}`).setDescription("Coriolis Storm — Dune: Awakening storm announcement")))
    .addTextDisplayComponents((text) => text.setContent("## Coriolis Storm Schedule"))
    .addTextDisplayComponents((text) => text.setContent(`**Starts:** <t:${starts}:F> (<t:${starts}:R>)\n**Ends:** <t:${ends}:F> (<t:${ends}:R>)`))
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(`Storm starts 24 hours before the API cycle end • Times shown in your timezone.\n-# Live Console schedule • Coriolis end ${ends}`));
  return { components: [card], files: [banner], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export function createStormAnnouncer(client: Client, channelId: string): (now?: number) => Promise<void> {
  let busy = false;
  return async (now = Date.now()): Promise<void> => {
    if (busy || !client.user || (process.env.DISCORD_SHARD_ID ?? "0") !== "0") return;
    busy = true;
    try {
      const response = await client.duneApi.call("GET", "/api/map/markers", { query: { static: 0 } });
      const window = stormWindowFromEnd(parseCoriolisEnd(response));
      if (window.end <= now) return;
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) throw new Error(`Storm announcement channel ${channelId} is not sendable.`);
      const marker = `Coriolis end ${Math.floor(window.end / 1000)}`;
      let before: string | undefined;
      for (;;) {
        const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (messages.some((message) => message.author.id === client.user!.id && JSON.stringify(message.components).includes(marker))) {
          return;
        }
        const oldest = messages.last();
        if (messages.size < 100 || !oldest || oldest.createdTimestamp < now - HISTORY_WINDOW_MS) break;
        before = oldest.id;
      }
      await channel.send(buildStormPanel(window.start, window.end));
    } finally {
      busy = false;
    }
  };
}

export function startStormAnnouncements(client: Client): NodeJS.Timeout | undefined {
  const channelId = readStormChannelId();
  if (!channelId || (process.env.DISCORD_SHARD_ID ?? "0") !== "0") return;
  const announce = createStormAnnouncer(client, channelId);
  const tick = (): void => { void announce().catch((error: unknown) => logger.error("Unable to announce the next Coriolis storm; will retry.", error)); };
  tick();
  return setInterval(tick, 60_000);
}
