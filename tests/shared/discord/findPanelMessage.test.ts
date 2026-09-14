import { describe, expect, it, vi } from "vitest";
import { findPanelMessage } from "../../../src/shared/discord/findPanelMessage";

function channelWith(messages: unknown[]) {
  const fetch = vi.fn().mockResolvedValue({ find: (predicate: (message: unknown) => boolean) => messages.find(predicate) });
  return { channel: { messages: { fetch } }, fetch };
}

describe("findPanelMessage", () => {
  it("finds a bot-authored marker nested inside component containers", async () => {
    const expected = { author: { id: "bot" }, components: [{ components: [{ data: { content: "## Server Information" } }] }] };
    const { channel, fetch } = channelWith([{ author: { id: "other" }, components: [{ content: "## Server Information" }] }, expected]);
    await expect(findPanelMessage(channel as never, "bot", "Server Information")).resolves.toBe(expected);
    expect(fetch).toHaveBeenCalledWith({ limit: 50 });
  });

  it("returns null when author and marker do not match", async () => {
    const { channel } = channelWith([{ author: { id: "bot" }, components: [{ content: "Another panel" }] }]);
    await expect(findPanelMessage(channel as never, "bot", "Rules")).resolves.toBeNull();
  });
});
