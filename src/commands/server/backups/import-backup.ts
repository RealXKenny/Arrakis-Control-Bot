import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { formatBackupResponse, importExternalBackup, replyBackupError } from "../../../modules/server/backups/backupActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("import-backup").setDescription("Import an external backup and its metadata.")
  .addAttachmentOption((option) => option.setName("backup").setDescription("Backup archive file.").setRequired(true))
  .addAttachmentOption((option) => option.setName("metadata").setDescription("Backup metadata file.").setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const response = await importExternalBackup(interaction.options.getAttachment("backup", true), interaction.options.getAttachment("metadata", true));
    await interaction.editReply({ content: `✅ ${formatBackupResponse(response)}`, allowedMentions: { parse: [] } });
  } catch (error: unknown) { await replyBackupError(interaction, "import-backup", error); }
}
class ImportBackupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "import-backup", description: "Import an external backup and its metadata.", preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}
export { ImportBackupCommand, data, execute };

