import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AssignPlayerFactionCommand, data, execute } = createPlayerAdminCommand("progression", "assign-faction");

export { AssignPlayerFactionCommand, data, execute };

