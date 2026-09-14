import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: UnlockPlayerResearchCommand, data, execute } = createPlayerAdminCommand("progression", "unlock-research");

export { UnlockPlayerResearchCommand, data, execute };

