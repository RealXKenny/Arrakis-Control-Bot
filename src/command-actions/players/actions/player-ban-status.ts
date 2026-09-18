import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "ban-status");

export { data, execute };


export const groupedAction = { data, execute };
