import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AddFactionReputationCommand, data, execute } = createPlayerAdminCommand("progression", "faction-reputation");

export { AddFactionReputationCommand, data, execute };

