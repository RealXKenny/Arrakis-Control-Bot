import { CATALOG_NAMES, searchCatalog, adminCatalogOptions, type CatalogName } from "../../modules/players/administration/gameCatalogs";
import { Command } from "@sapphire/framework";
import { escapeMarkdown, MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, type ChatInputCommandInteraction } from "discord.js";
import { GROUPED_ACTIONS } from "./groupedCommandCatalog";
import { registerApplicationCommand } from "./registerApplicationCommand";
import { hasStaffRole } from "../access/staffAccess";

type GroupName = typeof GROUPED_ACTIONS[number]["group"];
export function groupedCommandDefinition(group: GroupName) {
  const command = new SlashCommandBuilder().setName(group).setDescription(`${group[0].toUpperCase()}${group.slice(1)} commands and controls.`);
  const subgroups = new Map<string, SlashCommandSubcommandGroupBuilder>();
  for (const action of GROUPED_ACTIONS.filter((entry) => entry.group === group)) {
    const original = action.data.toJSON();
    const subcommand = new SlashCommandSubcommandBuilder().setName(action.name).setDescription(original.description);
    subcommand.options.push(...action.data.options as typeof subcommand.options);
    if (action.subgroup) {
      let subgroup = subgroups.get(action.subgroup);
      if (!subgroup) {
        subgroup = new SlashCommandSubcommandGroupBuilder().setName(action.subgroup).setDescription(`${action.subgroup} actions.`);
        subgroups.set(action.subgroup, subgroup);
        command.addSubcommandGroup(subgroup);
      }
      subgroup.addSubcommand(subcommand);
    } else command.addSubcommand(subcommand);
  }
  if (group === "player") command.addSubcommand((sub) => sub.setName("catalog").setDescription("Search the bundled game reference data.")
    .addStringOption((option) => option.setName("catalog").setDescription("Reference catalog").setRequired(true).addChoices(...CATALOG_NAMES.map((name) => ({ name, value: name }))))
    .addStringOption((option) => option.setName("query").setDescription("Name or identifier to search").setMaxLength(100)));
  return command;
}

export async function executeGroupedCommand(group: GroupName, interaction: ChatInputCommandInteraction): Promise<void> {
  const subgroup = interaction.options.getSubcommandGroup(false);
  const name = interaction.options.getSubcommand(true);
  if (group === "player" && !subgroup && name === "catalog") {
    const kind = interaction.options.getString("catalog", true) as CatalogName;
    if (!CATALOG_NAMES.includes(kind)) { await interaction.reply({ content: "Unknown catalog.", flags: MessageFlags.Ephemeral }); return; }
    const results = searchCatalog(kind, interaction.options.getString("query") ?? "", 10);
    const content = results.map((entry) => `**${escapeMarkdown(entry.name.slice(0, 100))}**\n${escapeMarkdown(entry.value)}${entry.detail ? `\n${escapeMarkdown(entry.detail.slice(0, 120))}` : ""}`).join("\n\n");
    await interaction.reply({ content: (`**${kind} reference** — up to 10 matches\n\n` + (content || "No matches found. Try a different name or ID.")).slice(0, 1950), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }
  const action = GROUPED_ACTIONS.find((entry) => entry.group === group && entry.subgroup === subgroup && entry.name === name);
  if (!action) {
    await interaction.reply({ content: "That command is no longer available. Refresh Discord's command list.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (action.access !== "Everyone") {
    const member = await interaction.guild?.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);
    const roleId = process.env.OWNER_ROLE_ID;
    const allowed = action.access === "Owner" ? Boolean(roleId && member?.roles.cache.has(roleId)) : hasStaffRole(member);
    if (!allowed) {
      await interaction.reply({ content: action.access === "Owner" ? "Only the configured owner role can use this command." : "You need a configured staff role to use this command.", flags: MessageFlags.Ephemeral });
      return;
    }
  }
  await action.execute(interaction);
}

export function createGroupedCommand(group: GroupName) {
  return class GroupedCommand extends Command {
    public constructor(context: Command.LoaderContext, options: Command.Options) {
      super(context, { ...options, name: group, description: `${group} commands and controls.`, preconditions: ["InteractionRateLimit"] });
    }
    public override async autocompleteRun(interaction: Command.AutocompleteInteraction): Promise<void> {
      if (group !== "player") { await interaction.respond([]); return; }
      const focused = interaction.options.getFocused(true);
      const choices = adminCatalogOptions(interaction.options.getSubcommand(), focused.name, String(focused.value), interaction.options.getString("vehicle-id"));
      await interaction.respond(choices);
    }
    public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, groupedCommandDefinition(group)); }
    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { await executeGroupedCommand(group, interaction); }
  };
}
