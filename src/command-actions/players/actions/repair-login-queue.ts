import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "repair-login-queue");

export { data, execute };


export const groupedAction = { data, execute };
