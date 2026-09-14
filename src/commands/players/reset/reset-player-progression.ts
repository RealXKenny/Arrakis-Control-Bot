import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: ResetPlayerProgressionCommand, data, execute } = createPlayerAdminCommand("reset", "reset-progression");

export { ResetPlayerProgressionCommand, data, execute };

