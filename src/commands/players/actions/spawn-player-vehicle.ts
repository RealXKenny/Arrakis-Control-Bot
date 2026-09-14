import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: SpawnPlayerVehicleCommand, data, execute } = createPlayerAdminCommand("actions", "spawn-vehicle");

export { SpawnPlayerVehicleCommand, data, execute };

