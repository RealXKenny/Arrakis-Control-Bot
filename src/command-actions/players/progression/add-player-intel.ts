import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "add-intel");

export { data, execute };


export const groupedAction = { data, execute };
