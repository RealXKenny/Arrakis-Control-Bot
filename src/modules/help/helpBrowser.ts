import { container } from "@sapphire/framework";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorSpacingSize, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type StringSelectMenuInteraction } from "discord.js";

import { truncateDiscordText } from "../../shared/discord/discordLimits";
import { HELP_CATEGORIES, getHelpCategory, type HelpAccess } from "./helpCatalog";
import type { HelpSession } from "./helpSessions";

const PAGE_SIZE = 6;
const ACCESS_ICONS: Record<HelpAccess, string> = { Everyone: "🌐", Staff: "🛡️", Owner: "🔒" };
type HelpInteraction = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;

function createHelpCard(session: HelpSession): ContainerBuilder {
  const category = getHelpCategory(session.categoryId) ?? HELP_CATEGORIES[0]!;
  const totalPages = Math.max(1, Math.ceil(category.commands.length / PAGE_SIZE));
  session.totalPages = totalPages;
  session.page = Math.min(Math.max(1, session.page), totalPages);
  const start = (session.page - 1) * PAGE_SIZE;
  const entries = category.commands.slice(start, start + PAGE_SIZE);
  const commandText = entries.map((entry) => {
    const access = entry.access ?? category.access;
    return `**/${entry.name}** ${ACCESS_ICONS[access]} \`${access}\`\n${truncateDiscordText(entry.description ?? getCommandDescription(entry.name), 160)}`;
  }).join("\n\n");

  const menu = new StringSelectMenuBuilder().setCustomId(`help-category:${session.id}`).setPlaceholder(category.label).setMinValues(1).setMaxValues(1)
    .addOptions(HELP_CATEGORIES.map((item) => new StringSelectMenuOptionBuilder().setLabel(item.label).setDescription(item.description.slice(0, 100)).setEmoji(item.emoji).setValue(item.id).setDefault(item.id === category.id)));
  const previous = new ButtonBuilder().setCustomId(`help-page:${session.id}:previous`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(session.page <= 1);
  const next = new ButtonBuilder().setCustomId(`help-page:${session.id}:next`).setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(session.page >= totalPages);

  return new ContainerBuilder().setAccentColor(0xc58b45)
    .addTextDisplayComponents((text) => text.setContent("## 📚 Arrakis Command Center"))
    .addTextDisplayComponents((text) => text.setContent("Browse commands by category. Access badges show who can run each command."))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`### ${category.emoji} ${category.label}\n-# ${category.description} · Page ${session.page} of ${totalPages}`))
    .addTextDisplayComponents((text) => text.setContent(commandText || "No commands are registered in this category."))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) => row.setComponents(menu))
    .addActionRowComponents((row) => row.setComponents(previous, next))
    .addTextDisplayComponents((text) => text.setContent(`-# 🌐 Everyone · 🛡️ Staff · 🔒 Owner · Requested by ${session.requestedBy} · Expires after 15 minutes`));
}

function getCommandDescription(name: string): string {
  const stores = (container as unknown as { stores?: { get(storeName: string): { get(pieceName: string): { description?: string } | undefined } | undefined } }).stores;
  return stores?.get("commands")?.get(name)?.description ?? `Run /${name} to use this command.`;
}

async function renderHelpBrowser(interaction: HelpInteraction, session: HelpSession): Promise<void> {
  // Dev note: Discord checks V2 papers at the container border.
  await interaction.editReply({
    content: null,
    embeds: [],
    components: [createHelpCard(session)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

export { PAGE_SIZE, createHelpCard, renderHelpBrowser };
