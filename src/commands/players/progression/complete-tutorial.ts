import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: CompleteTutorialCommand, data, execute } = createPlayerAdminCommand("progression", "tutorial-complete");

export { CompleteTutorialCommand, data, execute };

