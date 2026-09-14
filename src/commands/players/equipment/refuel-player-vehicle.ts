import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: RefuelPlayerVehicleCommand, data, execute } = createPlayerAdminCommand("equipment", "refuel-vehicle");

export { RefuelPlayerVehicleCommand, data, execute };

