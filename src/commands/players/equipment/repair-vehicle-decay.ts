import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: RepairVehicleDecayCommand, data, execute } = createPlayerAdminCommand("equipment", "repair-vehicle-decay");

export { RepairVehicleDecayCommand, data, execute };

