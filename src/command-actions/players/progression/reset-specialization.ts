import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "specialization-reset");

export { data, execute };


export const groupedAction = { data, execute };
