import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: DeleteInventoryItemCommand, data, execute } = createPlayerAdminCommand("inventory", "delete-item");

export { DeleteInventoryItemCommand, data, execute };

