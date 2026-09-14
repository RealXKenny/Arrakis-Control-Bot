import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: AugmentPlayerItemCommand, data, execute } = createPlayerAdminCommand("equipment", "augment-item");

export { AugmentPlayerItemCommand, data, execute };

