import { Command } from "@sapphire/framework";
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("delete-backup").setDescription(BACKUP_ACTIONS["delete-backup"].description)
  .addStringOption((option) => option.setName("backup").setDescription("Exact backup filename to delete.").setRequired(true))
  .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm permanent deletion of this backup.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.options.getBoolean("confirm", true)) { await interaction.reply({ content: "Deletion cancelled because confirmation was false.", flags: MessageFlags.Ephemeral }); return; }
  await executeBackupAction(interaction, "delete-backup", { routeParams: { backup: interaction.options.getString("backup", true).trim() } });
}
class DeleteBackupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "delete-backup", description: BACKUP_ACTIONS["delete-backup"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}
export { DeleteBackupCommand, data, execute };

