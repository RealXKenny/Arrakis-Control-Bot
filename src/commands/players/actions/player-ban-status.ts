import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: PlayerBanStatusCommand, data, execute } = createPlayerAdminCommand("actions", "ban-status");

export { PlayerBanStatusCommand, data, execute };

