import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: SetSkillPointsCommand, data, execute } = createPlayerAdminCommand("items", "set-skill-points");

export { SetSkillPointsCommand, data, execute };

