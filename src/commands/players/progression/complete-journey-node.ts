import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: CompleteJourneyNodeCommand, data, execute } = createPlayerAdminCommand("progression", "journey-complete");

export { CompleteJourneyNodeCommand, data, execute };

