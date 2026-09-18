import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("items", "give-items");

export { data, execute };


export const groupedAction = { data, execute };
