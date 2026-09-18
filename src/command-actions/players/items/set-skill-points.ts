import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("items", "set-skill-points");

export { data, execute };


export const groupedAction = { data, execute };
