import { Collection, EmbedBuilder, type Client, type Message } from "discord.js";
import { expect, it, vi } from "vitest";
import { MusicNowPlayingPanel, NOW_PLAYING_MARKER } from "../../../src/modules/music/MusicNowPlayingPanel";

it("keeps the oldest song card and deletes only the bot's marked duplicates", async () => {
  const card = (id: string, author: string, marked = true) => ({ id, author: { id: author },
    embeds: marked ? [{ footer: { text: NOW_PLAYING_MARKER } }] : [], delete: vi.fn(), edit: vi.fn() });
  const recent = card("new", "bot");
  const oldest = card("old", "bot");
  const human = card("human", "user");
  const controls = card("controls", "bot", false);
  const send = vi.fn();
  const fetch = vi.fn().mockResolvedValue(new Collection([recent, human, controls, oldest].map((item) => [item.id, item as unknown as Message])));
  const client = { user: { id: "bot" }, channels: { fetch: vi.fn().mockResolvedValue({ isSendable: () => true,
    isDMBased: () => false, messages: { fetch }, send }) } };
  const panel = new MusicNowPlayingPanel(client as unknown as Client, "requests");
  const payload = { embeds: [new EmbedBuilder().setDescription("Song")] };
  await panel.update(payload);
  await panel.update(payload);
  expect(recent.delete).toHaveBeenCalledOnce();
  expect(oldest.edit).toHaveBeenCalledTimes(2);
  expect(human.delete).not.toHaveBeenCalled();
  expect(controls.delete).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledOnce();
});

it("does not create more cards if reading history fails", async () => {
  const send = vi.fn();
  const client = { channels: { fetch: vi.fn().mockResolvedValue({ isSendable: () => true, isDMBased: () => false,
    messages: { fetch: vi.fn().mockRejectedValue(new Error("Forbidden")) }, send }) } };
  await expect(new MusicNowPlayingPanel(client as unknown as Client, "requests").update({ content: "Song" })).rejects.toThrow("Forbidden");
  expect(send).not.toHaveBeenCalled();
});
