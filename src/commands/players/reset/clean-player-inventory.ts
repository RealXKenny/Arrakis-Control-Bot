import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: CleanPlayerInventoryCommand, data, execute } = createPlayerAdminCommand("reset", "clean-inventory");

export { CleanPlayerInventoryCommand, data, execute };

