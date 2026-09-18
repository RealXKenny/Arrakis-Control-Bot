import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "add-currency");

export { data, execute };


export const groupedAction = { data, execute };
