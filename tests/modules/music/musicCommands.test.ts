import { ApplicationCommandOptionType } from "discord.js";
import { expect, it } from "vitest";
import { MUSIC_COMMANDS, type MusicCommandName } from "../../../src/modules/music/musicCommands";
import { musicCommandDefinition, musicGroupDefinition } from "../../../src/support/commands/musicCommandFactory";

it("groups music actions with their original options", () => {
  expect(musicGroupDefinition().toJSON().options).toHaveLength(10);
  for (const name of Object.keys(MUSIC_COMMANDS) as MusicCommandName[]) {
    const data = musicCommandDefinition(name).toJSON();
    expect(data.name).toBe(name === "music-panel" ? "panel" : name);
    expect(data.type).toBe(ApplicationCommandOptionType.Subcommand);
    expect(data.options?.some((option) => Number(option.type) === ApplicationCommandOptionType.Subcommand || Number(option.type) === ApplicationCommandOptionType.SubcommandGroup)).toBeFalsy();
  }
  expect(musicCommandDefinition("play").toJSON().options).toEqual([expect.objectContaining({ name: "query", required: true, type: ApplicationCommandOptionType.String })]);
  expect(musicCommandDefinition("volume").toJSON().options).toEqual([expect.objectContaining({ name: "level", required: true, min_value: 0, max_value: 100 })]);
});
