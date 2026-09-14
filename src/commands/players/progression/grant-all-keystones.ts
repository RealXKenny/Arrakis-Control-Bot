import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: GrantAllKeystonesCommand, data, execute } = createPlayerAdminCommand("progression", "keystones-grant-all");

export { GrantAllKeystonesCommand, data, execute };

