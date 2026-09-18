import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "assign-faction");

export { data, execute };


export const groupedAction = { data, execute };
