import { describe, expect, it } from "vitest";

import { data as configureAutoData } from "../../../../src/command-actions/server/backups/configure-auto-backup";
import { data as createData } from "../../../../src/command-actions/server/backups/create-backup";
import { data as deleteAllData } from "../../../../src/command-actions/server/backups/delete-all-backups";
import { data as deleteData } from "../../../../src/command-actions/server/backups/delete-backup";
import { data as downloadData } from "../../../../src/command-actions/server/backups/download-backup";
import { data as importData } from "../../../../src/command-actions/server/backups/import-backup";
import { data as restoreData } from "../../../../src/command-actions/server/backups/restore-backup";
import { BACKUP_ACTIONS, formatBackupResponse } from "../../../../src/modules/server/backups/backupActions";

describe("owner backup controls", () => {
  it("registers every missing backup operation as a standalone command", () => {
    const commands = [createData, restoreData, downloadData, deleteData, deleteAllData, importData, configureAutoData].map((command) => command.toJSON());

    expect(commands.map((command) => command.name)).toEqual(["create-backup", "restore-backup", "download-backup", "delete-backup", "delete-all-backups", "import-backup", "configure-auto-backup"]);
    expect(commands[1]?.options?.map((option) => option.name)).toEqual(["backup", "confirm"]);
    expect(commands[2]?.options?.map((option) => option.name)).toEqual(["backup"]);
    expect(commands[3]?.options?.map((option) => option.name)).toEqual(["backup", "confirm"]);
    expect(commands[4]?.options?.map((option) => option.name)).toEqual(["confirm"]);
    expect(commands[5]?.options?.map((option) => option.name)).toEqual(["backup", "metadata"]);
    expect(commands[6]?.options?.map((option) => option.name)).toEqual(["enabled", "time", "retention-days", "interval-hours"]);
  });

  it("maps mutation commands to the documented methods and routes", () => {
    expect(BACKUP_ACTIONS["create-backup"]).toMatchObject({ method: "POST", route: "/api/backups/create" });
    expect(BACKUP_ACTIONS["restore-backup"]).toMatchObject({ method: "POST", route: "/api/backups/restore" });
    expect(BACKUP_ACTIONS["delete-backup"]).toMatchObject({ method: "DELETE", route: "/api/backups/{backup}" });
    expect(BACKUP_ACTIONS["delete-all-backups"]).toMatchObject({ method: "POST", route: "/api/backups/delete-all" });
    expect(BACKUP_ACTIONS["configure-auto-backup"]).toMatchObject({ method: "POST", route: "/api/backups/auto" });
    expect(Object.keys(BACKUP_ACTIONS)).toHaveLength(5);
  });

  it("formats backup operation responses", () => {
    expect(formatBackupResponse({ message: "Backup created" })).toBe("Backup created");
    expect(formatBackupResponse({ stdout: "Created archive" })).toContain("Created archive");
    expect(formatBackupResponse({ enabled: true })).toContain('"enabled": true');
  });
});
