import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: ResetAllKeystonesCommand, data, execute } = createPlayerAdminCommand("progression", "keystones-reset-all");

export { ResetAllKeystonesCommand, data, execute };

