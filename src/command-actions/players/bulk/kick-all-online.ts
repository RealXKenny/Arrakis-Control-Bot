import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("bulk", "kick-all-online");

export { data, execute };


export const groupedAction = { data, execute };
