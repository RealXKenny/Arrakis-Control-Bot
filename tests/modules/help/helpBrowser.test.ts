import { describe, expect, it, vi } from "vitest";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import { data, execute } from "../../../src/commands/general/help/help";
import { HELP_CATEGORIES, getHelpCategory } from "../../../src/modules/help/helpCatalog";
import { createHelpCard } from "../../../src/modules/help/helpBrowser";
import { createHelpSession, getHelpSession, sweepHelpSessions } from "../../../src/modules/help/helpSessions";
import { DISCORD_LIMITS, countComponents, countDisplayableText } from "../../../src/shared/discord/discordLimits";
import { getStoreSnapshot } from "../../helpers/storeSnapshot";

describe("interactive help browser", () => {
  it("catalogs every command exactly once across professional categories", async () => {
    const { commands } = await getStoreSnapshot();
    const catalogNames = HELP_CATEGORIES.flatMap((category) => category.commands.map((command) => command.name));

    expect(HELP_CATEGORIES).toHaveLength(14);
    expect(new Set(catalogNames).size).toBe(81);
    expect(new Set(catalogNames.map((name) => name.split(" ")[0]))).toEqual(new Set(commands));
    expect(getHelpCategory("player-progression")?.commands).toHaveLength(15);
  });

  it("registers category choices and keeps every rendered page within Discord limits", async () => {
    await getStoreSnapshot();
    const command = data.toJSON();
    const choices = command.options?.[0] && "choices" in command.options[0] ? command.options[0].choices : [];
    const session = createHelpSession({ ownerId: "owner", requestedBy: "Tester", categoryId: "player-progression" });
    const card = createHelpCard(session).toJSON();

    expect(choices).toHaveLength(14);
    expect(session.totalPages).toBe(3);
    expect(countDisplayableText(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(countComponents(card)).toBeLessThanOrEqual(DISCORD_LIMITS.componentCount);
  });

  it("binds sessions to their identifiers and expires stale sessions", () => {
    const session = createHelpSession({ ownerId: "owner", requestedBy: "Tester" });
    expect(getHelpSession(session.id)?.ownerId).toBe("owner");
    sweepHelpSessions(session.touchedAt + 16 * 60 * 1_000);
    expect(getHelpSession(session.id)).toBeNull();
  });

  it("publishes a public Components V2 reply", async () => {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      user: { id: "owner", tag: "Tester" },
      options: { getString: () => null },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    expect(deferReply).toHaveBeenCalledWith();
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      components: expect.any(Array),
      flags: MessageFlags.IsComponentsV2,
    }));
  });
});
