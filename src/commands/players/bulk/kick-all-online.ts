import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: KickAllOnlineCommand, data, execute } = createPlayerAdminCommand("bulk", "kick-all-online");

export { KickAllOnlineCommand, data, execute };

