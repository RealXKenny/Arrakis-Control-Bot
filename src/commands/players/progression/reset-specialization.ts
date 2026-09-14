import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: ResetSpecializationCommand, data, execute } = createPlayerAdminCommand("progression", "specialization-reset");

export { ResetSpecializationCommand, data, execute };

