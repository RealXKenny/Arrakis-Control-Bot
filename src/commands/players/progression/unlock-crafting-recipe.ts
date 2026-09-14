import { createPlayerAdminCommand } from "../../../support/commands/playerAdminCommandFactory";

const { CommandClass: UnlockCraftingRecipeCommand, data, execute } = createPlayerAdminCommand("progression", "unlock-recipe");

export { UnlockCraftingRecipeCommand, data, execute };

