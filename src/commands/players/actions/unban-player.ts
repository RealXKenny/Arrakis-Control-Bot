import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: UnbanPlayerCommand, data, execute } = createPlayerAdminCommand("actions", "unban");

export { UnbanPlayerCommand, data, execute };

