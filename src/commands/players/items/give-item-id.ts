import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: GiveItemIdCommand, data, execute } = createPlayerAdminCommand("items", "give-item-id");

export { GiveItemIdCommand, data, execute };

