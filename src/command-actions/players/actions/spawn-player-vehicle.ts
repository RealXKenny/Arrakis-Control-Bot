import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("actions", "spawn-vehicle");

export { data, execute };


export const groupedAction = { data, execute };
