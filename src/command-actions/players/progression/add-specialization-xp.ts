import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("progression", "specialization-add-xp");

export { data, execute };


export const groupedAction = { data, execute };
