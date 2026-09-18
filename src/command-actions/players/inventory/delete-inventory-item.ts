import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("inventory", "delete-item");

export { data, execute };


export const groupedAction = { data, execute };
