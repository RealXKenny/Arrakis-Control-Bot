import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "keystones-reset-all");

export { data, execute };


export const groupedAction = { data, execute };
