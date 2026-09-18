import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "faction-reputation");

export { data, execute };


export const groupedAction = { data, execute };
