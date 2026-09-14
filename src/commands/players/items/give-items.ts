import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: GiveItemsCommand, data, execute } = createPlayerAdminCommand("items", "give-items");

export { GiveItemsCommand, data, execute };

