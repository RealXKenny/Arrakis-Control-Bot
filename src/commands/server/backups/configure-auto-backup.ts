import { Command } from "@sapphire/framework";
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BACKUP_ACTIONS, executeBackupAction } from "../../../modules/server/backups/backupActions";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder().setName("configure-auto-backup").setDescription(BACKUP_ACTIONS["configure-auto-backup"].description)
  .addBooleanOption((option) => option.setName("enabled").setDescription("Enable automatic backups.").setRequired(true))
  .addStringOption((option) => option.setName("time").setDescription("Daily backup time, such as 03:00.").setRequired(true))
  .addIntegerOption((option) => option.setName("retention-days").setDescription("Days to retain backups.").setMinValue(1).setRequired(true))
  .addIntegerOption((option) => option.setName("interval-hours").setDescription("Hours between backups.").setMinValue(1).setRequired(true));
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await executeBackupAction(interaction, "configure-auto-backup", { body: { enabled: interaction.options.getBoolean("enabled", true), time: interaction.options.getString("time", true).trim(), retentionDays: interaction.options.getInteger("retention-days", true), intervalHours: interaction.options.getInteger("interval-hours", true) } });
}
class ConfigureAutoBackupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "configure-auto-backup", description: BACKUP_ACTIONS["configure-auto-backup"].description, preconditions: ["InteractionRateLimit", "OwnerRoleOnly"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { return execute(interaction); }
}
export { ConfigureAutoBackupCommand, data, execute };

