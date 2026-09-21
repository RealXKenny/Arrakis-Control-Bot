import { ChannelType, type Client, type Interaction } from "discord.js";
import { expect, it, vi } from "vitest";
import { DiscordAuditLogger } from "../../../src/modules/audit/DiscordAuditLogger";

it("renders detailed music interaction context and playback state", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const client = { channels: { fetch: vi.fn().mockResolvedValue({ isSendable: () => true, send }) } } as unknown as Client;
  const logger = new DiscordAuditLogger(client, undefined, "activity");
  const interaction = {
    id: "interaction-id",
    createdTimestamp: 1_725_000_000_000,
    user: { id: "user-id", tag: "listener", globalName: "Listener" },
    member: { displayName: "Desert Listener" },
    guild: { name: "Arrakis" },
    guildId: "guild-id",
    channel: { name: "music-requests", type: ChannelType.GuildText },
    channelId: "channel-id",
    locale: "en-US",
    guildLocale: "en-US",
    customId: "music-edit:request",
    isChatInputCommand: () => false,
    isButton: () => false,
    isMessageComponent: () => false,
    isAnySelectMenu: () => false,
    isModalSubmit: () => true,
    isFromMessage: () => false,
  } as unknown as Interaction;

  await logger.musicInteraction(interaction, "music-edit:request", {
    action: "Submit song request",
    status: "Succeeded",
    input: '"As It Was" by Harry Styles',
    outcome: "Added As It Was.",
  }, {
    available: true,
    connected: true,
    paused: false,
    volume: 30,
    position: 15_000,
    current: { title: "As It Was", artist: "Harry Styles", requester: "user-id", source: "soundcloud", duration: 167_000, uri: "https://soundcloud.com/track" },
    queue: [{ title: "Late Night Talking", artist: "Harry Styles", requester: "next-user" }],
  });

  const rendered = JSON.stringify(send.mock.calls[0]?.[0].components.map((component: { toJSON(): unknown }) => component.toJSON()));
  expect(rendered).toContain("interaction-id");
  expect(rendered).toContain("Submitted value");
  expect(rendered).toContain("Submit song request");
  expect(rendered).toContain("As It Was");
  expect(rendered).toContain("Harry Styles");
  expect(rendered).toContain("Late Night Talking");
  expect(rendered).toContain("0:15");
  expect(rendered).toContain("Succeeded");
});
