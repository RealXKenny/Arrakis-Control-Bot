import { expect, it, vi } from "vitest";
import { selectVoiceMember } from "../../../src/interaction-handlers/voice/voice-member-menu";
import { confirmVoiceClose } from "../../../src/interaction-handlers/voice/voice-close-button";
import { VoiceUserError } from "../../../src/modules/voice/VoiceService";

function interaction(customId: string) {
  return {
    customId, guild: { id: "guild" }, user: { id: "owner" }, channelId: "controls",
    values: ["target"], deferred: true, deferUpdate: vi.fn(), editReply: vi.fn(),
    client: { voiceRooms: { control: vi.fn() }, logger: { error: vi.fn() } },
  };
}

it.each(["permit", "reject", "kick"])("binds %s selections to the original room and public panel", async (action) => {
  const input = interaction(`voice-member:${action}:123:456`);
  await selectVoiceMember(input as never);
  expect(input.client.voiceRooms.control).toHaveBeenCalledWith(input.guild, "owner", action, "target", "controls", "123", "456");
  expect(input.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
});

it("revalidates ownership before confirming room deletion", async () => {
  const input = interaction("voice-close:123:456");
  input.client.voiceRooms.control.mockRejectedValue(new VoiceUserError("Stay inside your room."));
  await confirmVoiceClose(input as never);
  expect(input.client.voiceRooms.control).toHaveBeenCalledWith(input.guild, "owner", "delete", undefined, "controls", "123", "456");
  expect(input.editReply).toHaveBeenCalledWith({ content: "Stay inside your room." });
});

it("cancels deletion without invoking a room action", async () => {
  const input = interaction("voice-cancel:123:456");
  await confirmVoiceClose(input as never);
  expect(input.client.voiceRooms.control).not.toHaveBeenCalled();
  expect(input.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
});

it("rechecks the original room and panel on reset confirmation", async () => {
  const input = interaction("voice-reset:123:456");
  await confirmVoiceClose(input as never);
  expect(input.client.voiceRooms.control).toHaveBeenCalledWith(input.guild, "owner", "reset", undefined, "controls", "123", "456");
  expect(input.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
});
