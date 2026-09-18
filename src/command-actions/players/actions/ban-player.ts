import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "ban");

export { data, execute };


export const groupedAction = { data, execute };
