import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "keystones-grant-all");

export { data, execute };


export const groupedAction = { data, execute };
