import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("items", "give-item-id");

export { data, execute };


export const groupedAction = { data, execute };
