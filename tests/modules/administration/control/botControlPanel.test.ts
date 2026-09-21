import { describe, expect, it } from "vitest";

import { buildBotControlPanel } from "../../../../src/modules/administration/control/botControlPanel";
import { botStatus, canControlBot } from "../../../../src/modules/administration/control/botControlActions";
import { persistentPanelTasks } from "../../../../src/modules/administration/control/panelRefresh";

describe("bot control panel", () => {
  it("renders every owner operation with stable custom IDs", () => {
    const panel = buildBotControlPanel({ music: {}, leveling: {}, voiceRooms: {}, chatBridge: {}, discordAdapter: {} } as never);
    const json = JSON.stringify(panel.toJSON());
    for (const action of ["status", "refresh-panels", "reload", "resync", "restart"]) {
      expect(json).toContain(`bot-control:${action}`);
    }
    expect(json).toContain("Arrakis Control Center");
  });

  it("limits controls to the guild owner or configured Owner role", () => {
    process.env.OWNER_ROLE_ID = "owner-role";
    expect(canControlBot({ user: { id: "guild-owner" }, guild: { ownerId: "guild-owner" } } as never)).toBe(true);
    expect(canControlBot({ user: { id: "operator" }, guild: { ownerId: "guild-owner" }, member: { roles: ["owner-role"] } } as never)).toBe(true);
    expect(canControlBot({ user: { id: "member" }, guild: { ownerId: "guild-owner" }, member: { roles: ["other"] } } as never)).toBe(false);
    delete process.env.OWNER_ROLE_ID;
  });

  it("summarizes live core and optional service health", () => {
    const status = botStatus({
      isReady: () => true,
      ws: { ping: 42 },
      uptime: 3_660_000,
      guilds: { cache: { size: 2 } },
      tickets: {},
      music: { auditSnapshot: () => ({ available: true, connected: false }) },
    } as never);
    expect(status).toContain("42 ms");
    expect(status).toContain("Lavalink ready");
    expect(status).toContain("1h 1m");
  });

  it("refreshes configured persistent panels and skips missing destinations", () => {
    const stormChannel = process.env.STORM_CHANNEL_ID;
    delete process.env.STORM_CHANNEL_ID;
    const tasks = persistentPanelTasks({
      discordBotControlChannelId: "control",
      discordRolePanelChannelId: "roles",
      discordVerifyChannelId: undefined,
      discordAdapter: {},
      discordAdapterLinkPanelChannelId: "links",
      music: { publishPanel: () => Promise.resolve() },
      voiceRooms: { panel: () => Promise.resolve() },
    } as never, {} as never);
    if (stormChannel === undefined) delete process.env.STORM_CHANNEL_ID;
    else process.env.STORM_CHANNEL_ID = stormChannel;

    expect(tasks.map((task) => task.label)).toEqual([
      "bot control panel",
      "role panel",
      "player link panel",
      "music panel",
      "voice panel",
    ]);
  });
});
