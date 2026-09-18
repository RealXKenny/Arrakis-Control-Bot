import { Collection, type GuildMember, type VoiceChannel } from "discord.js";
import { expect, it } from "vitest";
import { voiceKickPicker } from "../../../src/modules/voice/voiceKickPicker";

function channel(ids: string[]) {
  return {
    id: "123", client: { user: { id: "bot" } },
    members: new Collection(ids.map((id) => [id, { id, displayName: id, user: { username: id } } as GuildMember])),
  } as VoiceChannel;
}

it("lists only room occupants, excluding the creator and this bot", () => {
  const result = voiceKickPicker(channel(["owner", "bot", "member"]), "owner", "456");
  const row = result.components[0].toJSON();
  const menu = row.components[0];
  expect(menu.type).toBe(3);
  if (menu.type === 3) expect(menu.options.map((option) => option.value)).toEqual(["member"]);
  expect(voiceKickPicker(channel(["owner", "bot"]), "owner", "456").components).toEqual([]);
});

it("paginates larger rooms so every occupant is selectable", () => {
  const room = channel(Array.from({ length: 30 }, (_, index) => `member${index}`));
  const result = voiceKickPicker(room, "owner", "456", 1);
  const menu = result.components[0].toJSON().components[0];
  if (menu.type === 3) expect(menu.options.map((option) => option.value)).toEqual(["member25", "member26", "member27", "member28", "member29"]);
  expect(result.content).toContain("Page 2/2");
  expect(result.components).toHaveLength(2);
});
