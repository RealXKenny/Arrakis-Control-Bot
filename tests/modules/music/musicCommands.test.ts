import { ApplicationCommandOptionType } from "discord.js";
import { expect, it } from "vitest";
import { MUSIC_COMMANDS, type MusicCommandName } from "../../../src/modules/music/musicCommands";
import { musicCommandDefinition } from "../../../src/support/commands/musicCommandFactory";

it("registers standalone commands with direct play and volume options, never subcommands", () => {
  for (const name of Object.keys(MUSIC_COMMANDS) as MusicCommandName[]) {
    const data = musicCommandDefinition(name).toJSON();
    expect(data.name).toBe(name);
    expect(data.options?.some((option) => option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup)).toBeFalsy();
  }
  expect(musicCommandDefinition("play").toJSON().options).toEqual([expect.objectContaining({ name: "query", required: true, type: ApplicationCommandOptionType.String })]);
  expect(musicCommandDefinition("volume").toJSON().options).toEqual([expect.objectContaining({ name: "level", required: true, min_value: 0, max_value: 100 })]);
});
