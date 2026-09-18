import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("equipment", "repair-gear");

export { data, execute };


export const groupedAction = { data, execute };
