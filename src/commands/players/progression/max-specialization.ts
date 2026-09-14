import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: MaxSpecializationCommand, data, execute } = createPlayerAdminCommand("progression", "specialization-max");

export { MaxSpecializationCommand, data, execute };

