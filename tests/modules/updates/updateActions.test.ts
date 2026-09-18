import { describe, expect, it } from "vitest";

import { data as applyGameData } from "../../../src/command-actions/updates/game/apply-game-update";
import { data as autoStatusData } from "../../../src/command-actions/updates/game/auto-update-status";
import { data as checkGameData } from "../../../src/command-actions/updates/game/check-game-update";
import { data as configureAutoData } from "../../../src/command-actions/updates/game/configure-auto-update";
import { data as fixSteamcmdData } from "../../../src/command-actions/updates/runtime/fix-steamcmd";
import { data as repairRuntimeData } from "../../../src/command-actions/updates/runtime/repair-runtime";
import { data as applyStackData } from "../../../src/command-actions/updates/stack/apply-stack-update";
import { data as checkStackData } from "../../../src/command-actions/updates/stack/check-stack-update";
import { UPDATE_ACTIONS, formatUpdateResponse, getUpdateAction } from "../../../src/modules/updates/updateActions";

describe("owner update controls", () => {
  it("registers each update route as a standalone command", () => {
    const commands = [checkGameData, applyGameData, fixSteamcmdData, checkStackData, applyStackData, autoStatusData, configureAutoData, repairRuntimeData].map((command) => command.toJSON());

    expect(commands.map((command) => command.name)).toEqual(["check-game-update", "apply-game-update", "fix-steamcmd", "check-stack-update", "apply-stack-update", "auto-update-status", "configure-auto-update", "repair-runtime"]);
    expect(commands[0]?.options?.map((option) => option.name)).toEqual(["fresh"]);
    expect(commands[6]?.options?.map((option) => option.name)).toEqual(["enabled", "interval-minutes", "apply-enabled", "notify-enabled", "notify-minutes", "wait-until-empty", "max-wait-minutes", "confirmation"]);
  });

  it("maps every command to the documented Console route and method", () => {
    expect(getUpdateAction("check-game-update")).toMatchObject({ method: "POST", route: "/api/updates/check-game" });
    expect(getUpdateAction("apply-game-update")).toMatchObject({ method: "POST", route: "/api/updates/apply-game" });
    expect(getUpdateAction("fix-steamcmd")).toMatchObject({ method: "POST", route: "/api/updates/fix-steamcmd" });
    expect(getUpdateAction("check-stack-update")).toMatchObject({ method: "POST", route: "/api/updates/check-stack" });
    expect(getUpdateAction("apply-stack-update")).toMatchObject({ method: "POST", route: "/api/updates/apply-stack" });
    expect(getUpdateAction("auto-update-status")).toMatchObject({ method: "GET", route: "/api/updates/auto-game" });
    expect(getUpdateAction("configure-auto-update")).toMatchObject({ method: "POST", route: "/api/updates/auto-game" });
    expect(getUpdateAction("repair-runtime")).toMatchObject({ method: "POST", route: "/api/updates/repair-runtime" });
    expect(Object.keys(UPDATE_ACTIONS)).toHaveLength(8);
  });

  it("formats structured and command-output responses", () => {
    expect(formatUpdateResponse({ message: "Update available" })).toBe("Update available");
    expect(formatUpdateResponse({ stdout: "No update available" })).toContain("No update available");
    expect(formatUpdateResponse({ enabled: true })).toContain('"enabled": true');
  });
});
