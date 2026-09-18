import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("items", "set-skill-module");

export { data, execute };


export const groupedAction = { data, execute };
