import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: RepairLoginQueueCommand, data, execute } = createPlayerAdminCommand("actions", "repair-login-queue");

export { RepairLoginQueueCommand, data, execute };

