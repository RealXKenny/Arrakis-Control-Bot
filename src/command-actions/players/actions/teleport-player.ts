import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "teleport");

export { data, execute };


export const groupedAction = { data, execute };
