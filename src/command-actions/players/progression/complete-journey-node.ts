import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "journey-complete");

export { data, execute };


export const groupedAction = { data, execute };
