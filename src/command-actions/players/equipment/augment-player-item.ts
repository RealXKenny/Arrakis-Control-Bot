import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("equipment", "augment-item");

export { data, execute };


export const groupedAction = { data, execute };
