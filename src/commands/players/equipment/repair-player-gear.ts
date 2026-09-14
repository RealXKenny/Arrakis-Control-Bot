import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: RepairPlayerGearCommand, data, execute } = createPlayerAdminCommand("equipment", "repair-gear");

export { RepairPlayerGearCommand, data, execute };

