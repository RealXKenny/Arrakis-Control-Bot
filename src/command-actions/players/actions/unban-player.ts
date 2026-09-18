import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "unban");

export { data, execute };


export const groupedAction = { data, execute };
