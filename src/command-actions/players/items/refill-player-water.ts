import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("items", "refill-water");

export { data, execute };


export const groupedAction = { data, execute };
