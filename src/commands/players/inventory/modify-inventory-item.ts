import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: ModifyInventoryItemCommand, data, execute } = createPlayerAdminCommand("inventory", "modify-item");

export { ModifyInventoryItemCommand, data, execute };

