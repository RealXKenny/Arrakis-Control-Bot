import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "journey-reset");

export { data, execute };


export const groupedAction = { data, execute };
