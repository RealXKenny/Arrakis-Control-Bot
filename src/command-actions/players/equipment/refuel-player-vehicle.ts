import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { data, execute } = createPlayerAdminCommand("equipment", "refuel-vehicle");

export { data, execute };


export const groupedAction = { data, execute };
