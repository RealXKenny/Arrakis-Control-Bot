import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: RefillPlayerWaterCommand, data, execute } = createPlayerAdminCommand("items", "refill-water");

export { RefillPlayerWaterCommand, data, execute };

