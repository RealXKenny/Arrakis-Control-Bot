import { Command } from "@sapphire/framework";
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("delete-all-backups").setDescription(BACKUP_ACTIONS["delete-all-backups"].description)
  .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm permanent deletion of every backup.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.options.getBoolean("confirm", true)) { await interaction.reply({ content: "Bulk deletion cancelled because confirmation was false.", flags: MessageFlags.Ephemeral }); return; }
  await executeBackupAction(interaction, "delete-all-backups", { body: {} });
}
class DeleteAllBackupsCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "delete-all-backups", description: BACKUP_ACTIONS["delete-all-backups"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}
export { DeleteAllBackupsCommand, data, execute };

