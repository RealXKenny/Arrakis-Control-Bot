import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: ResetTutorialCommand, data, execute } = createPlayerAdminCommand("progression", "tutorial-reset");

export { ResetTutorialCommand, data, execute };

