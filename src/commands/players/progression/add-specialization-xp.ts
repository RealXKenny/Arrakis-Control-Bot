import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AddSpecializationXpCommand, data, execute } = createPlayerAdminCommand("progression", "specialization-add-xp");

export { AddSpecializationXpCommand, data, execute };

