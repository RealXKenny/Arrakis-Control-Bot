import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "specialization-max");

export { data, execute };


export const groupedAction = { data, execute };
