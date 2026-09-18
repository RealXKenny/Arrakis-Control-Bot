import { describe, expect, it } from "vitest";

import { PLAYER_ADMIN_ACTIONS, formatPlayerAdminResponse, getPlayerAdminAction, parseJson } from "../../../../src/modules/players/administration/playerAdminActions";
import { PLAYER_ADMIN_COMMAND_NAMES, buildPlayerAdminCommandData } from "../../../../src/support/commands/playerAdminCommandFactory";

describe("player administration controls", () => {
  it("preserves every player action definition for grouped registration", () => {
    const commands = PLAYER_ADMIN_ACTIONS.map((action) => buildPlayerAdminCommandData(action).toJSON());
    const names = commands.map((command) => command.name);

    expect(commands).toHaveLength(38);
    expect(new Set(names).size).toBe(38);
    expect(names).toEqual(Object.values(PLAYER_ADMIN_COMMAND_NAMES));
    expect(names).toContain("give-item");
    expect(names).toContain("kick-player");
    expect(names).toContain("ban-player");
    expect(names).toContain("kick-all-online");
    expect(commands.every((command) => command.options?.every((option) => option.type !== 1 && option.type !== 2))).toBe(true);
  });

  it("maps every attached endpoint with no duplicate group/action keys", () => {
    expect(PLAYER_ADMIN_ACTIONS).toHaveLength(38);
    expect(new Set(PLAYER_ADMIN_ACTIONS.map((action) => `${action.group}.${action.name}`)).size).toBe(38);
    expect(getPlayerAdminAction("items", "give-item")).toMatchObject({ method: "POST", route: "/api/players/{playerId}/give-item" });
    expect(getPlayerAdminAction("actions", "ban-status")).toMatchObject({ method: "GET", route: "/api/players/{playerId}/ban" });
    expect(getPlayerAdminAction("actions", "unban")).toMatchObject({ method: "DELETE", route: "/api/players/{playerId}/ban" });
    expect(getPlayerAdminAction("inventory", "modify-item")).toMatchObject({ method: "PATCH", route: "/api/players/{playerId}/inventory/{itemId}" });
    expect(getPlayerAdminAction("bulk", "kick-all-online")).toMatchObject({ method: "POST", route: "/api/players/kick-all-online", playerScoped: false });
    expect(getPlayerAdminAction("missing", "missing")).toBeNull();
  });

  it("validates structured JSON options and formats Console responses", () => {
    expect(parseJson('[{"itemId":"ore"}]', "array", "items-json")).toEqual([{ itemId: "ore" }]);
    expect(parseJson('{"durability":100}', "object", "values-json")).toEqual({ durability: 100 });
    expect(() => parseJson("{}", "array", "items-json")).toThrow("JSON array");
    expect(() => parseJson("not-json", "object", "values-json")).toThrow("valid JSON");
    expect(formatPlayerAdminResponse({ message: "Player updated" })).toBe("Player updated");
  });
});
