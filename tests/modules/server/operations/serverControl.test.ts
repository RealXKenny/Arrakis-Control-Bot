import { describe, expect, it } from "vitest";

import { data as restartServerData } from "../../../../src/commands/server/lifecycle/restart-server";
import { data as startServerData } from "../../../../src/commands/server/lifecycle/start-server";
import { data as stopServerData } from "../../../../src/commands/server/lifecycle/stop-server";
import { data as cleanupBuildCacheData } from "../../../../src/commands/server/maintenance/cleanup-build-cache";
import { data as cleanupImagesData } from "../../../../src/commands/server/maintenance/cleanup-images";
import { data as fixNetworkData } from "../../../../src/commands/server/maintenance/fix-network";
import { data as restartServiceData } from "../../../../src/commands/server/services/restart-service";
import { data as servicesData, normalizeServiceRows } from "../../../../src/commands/server/services/services";
import { SERVER_ACTIONS, getResponseMessage, getServerAction } from "../../../../src/modules/server/operations/serverActions";

describe("owner server controls", () => {
  it("registers each server action as its own top-level command", () => {
    const commands = [startServerData, stopServerData, restartServerData, fixNetworkData, cleanupImagesData, cleanupBuildCacheData, servicesData, restartServiceData].map((command) => command.toJSON());

    expect(commands.map((command) => command.name)).toEqual(["start-server", "stop-server", "restart-server", "fix-network", "cleanup-images", "cleanup-build-cache", "services", "restart-service"]);
    expect(commands.filter((command) => !["restart-server", "restart-service"].includes(command.name)).every((command) => !command.options?.length)).toBe(true);
    expect(commands[2]?.options?.map((option) => option.name)).toEqual(["immediate"]);
    expect(commands[7]?.options?.map((option) => option.name)).toEqual(["service", "immediate"]);
  });

  it("maps each action to its non-idempotent Console endpoint", () => {
    expect(getServerAction("start-server")?.route).toBe("/api/server/start");
    expect(getServerAction("stop-server")?.route).toBe("/api/server/stop");
    expect(getServerAction("restart-server")?.route).toBe("/api/server/restart");
    expect(getServerAction("restart-service")?.route).toBe("/api/server/restart-service");
    expect(getServerAction("fix-network")?.route).toBe("/api/server/network-bind/fix");
    expect(getServerAction("cleanup-images")).toMatchObject({
      route: "/api/server/storage/cleanup-images",
      body: { confirmation: "CLEAN OBSOLETE DUNE IMAGES" },
    });
    expect(getServerAction("cleanup-build-cache")).toMatchObject({
      route: "/api/server/storage/cleanup-build-cache",
      body: { confirmation: "CLEAN DOCKER BUILD CACHE" },
    });
    expect(getServerAction("invalid")).toBeNull();
    expect(Object.keys(SERVER_ACTIONS)).toHaveLength(7);
  });

  it("normalizes Console success messages", () => {
    expect(getResponseMessage({ message: "Server started" })).toBe("Server started");
    expect(getResponseMessage("Restart queued")).toBe("Restart queued");
    expect(getResponseMessage({ ok: true })).toBeNull();
  });

  it("parses the Console services stdout table", () => {
    expect(
      normalizeServiceRows({
        operation: "services",
        stdout: "NAMES                    STATUS              PORTS\ndune-server              Up 2 hours (healthy)  7777/udp\ndune-database            Exited (1) 1 min ago",
        stderr: "",
        exitCode: 0,
      }),
    ).toEqual([
      { name: "dune-server", status: "Up 2 hours (healthy)", ports: "7777/udp" },
      { name: "dune-database", status: "Exited (1) 1 min ago", ports: "" },
    ]);
  });
});
