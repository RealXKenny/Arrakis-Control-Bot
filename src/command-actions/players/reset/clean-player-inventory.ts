import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("reset", "clean-inventory");

export { data, execute };


export const groupedAction = { data, execute };
