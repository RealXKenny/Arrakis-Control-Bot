import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AddPlayerCurrencyCommand, data, execute } = createPlayerAdminCommand("progression", "add-currency");

export { AddPlayerCurrencyCommand, data, execute };

