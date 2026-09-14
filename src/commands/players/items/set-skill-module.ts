import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: SetSkillModuleCommand, data, execute } = createPlayerAdminCommand("items", "set-skill-module");

export { SetSkillModuleCommand, data, execute };

