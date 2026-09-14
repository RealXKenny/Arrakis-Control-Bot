import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: KickPlayerCommand, data, execute } = createPlayerAdminCommand("actions", "kick");

export { KickPlayerCommand, data, execute };

