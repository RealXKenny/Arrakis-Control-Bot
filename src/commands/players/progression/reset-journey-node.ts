import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: ResetJourneyNodeCommand, data, execute } = createPlayerAdminCommand("progression", "journey-reset");

export { ResetJourneyNodeCommand, data, execute };

