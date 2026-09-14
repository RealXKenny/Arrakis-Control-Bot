import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AddPlayerXpCommand, data, execute } = createPlayerAdminCommand("items", "add-xp");

export { AddPlayerXpCommand, data, execute };

