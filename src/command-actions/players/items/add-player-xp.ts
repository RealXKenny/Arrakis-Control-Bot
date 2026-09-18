import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("items", "add-xp");

export { data, execute };


export const groupedAction = { data, execute };
