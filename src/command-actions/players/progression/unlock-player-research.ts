import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "unlock-research");

export { data, execute };


export const groupedAction = { data, execute };
