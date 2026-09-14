import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: BanPlayerCommand, data, execute } = createPlayerAdminCommand("actions", "ban");

export { BanPlayerCommand, data, execute };

