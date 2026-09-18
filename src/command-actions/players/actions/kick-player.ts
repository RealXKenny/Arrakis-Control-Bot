import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "kick");

export { data, execute };


export const groupedAction = { data, execute };
