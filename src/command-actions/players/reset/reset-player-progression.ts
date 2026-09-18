import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("reset", "reset-progression");

export { data, execute };


export const groupedAction = { data, execute };
