import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("create-backup").setDescription(BACKUP_ACTIONS["create-backup"].description);
async function execute(interaction: ChatInputCommandInteraction): Promise<void> { await executeBackupAction(interaction, "create-backup", { body: {} }); }
class CreateBackupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "create-backup", description: BACKUP_ACTIONS["create-backup"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}
export { CreateBackupCommand, data, execute };

