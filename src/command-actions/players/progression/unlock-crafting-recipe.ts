import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "unlock-recipe");

export { data, execute };


export const groupedAction = { data, execute };
