import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AddPlayerIntelCommand, data, execute } = createPlayerAdminCommand("progression", "add-intel");

export { AddPlayerIntelCommand, data, execute };

