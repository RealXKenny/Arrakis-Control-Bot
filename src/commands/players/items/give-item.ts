import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: GiveItemCommand, data, execute } = createPlayerAdminCommand("items", "give-item");

export { GiveItemCommand, data, execute };

