import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: TeleportPlayerCommand, data, execute } = createPlayerAdminCommand("actions", "teleport");

export { TeleportPlayerCommand, data, execute };

