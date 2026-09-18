import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("equipment", "repair-vehicle-decay");

export { data, execute };


export const groupedAction = { data, execute };
