import { Command } from "@sapphire/framework";
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("restore-backup").setDescription(BACKUP_ACTIONS["restore-backup"].description)
  .addStringOption((option) => option.setName("backup").setDescription("Exact backup filename to restore.").setRequired(true))
  .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm that the current server data will be replaced.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.options.getBoolean("confirm", true)) { await interaction.reply({ content: "Restore cancelled because confirmation was false.", flags: MessageFlags.Ephemeral }); return; }
  await executeBackupAction(interaction, "restore-backup", { body: { backup: interaction.options.getString("backup", true).trim() } });
}
class RestoreBackupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "restore-backup", description: BACKUP_ACTIONS["restore-backup"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}
export { RestoreBackupCommand, data, execute };

