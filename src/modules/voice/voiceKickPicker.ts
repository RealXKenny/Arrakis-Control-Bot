import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type VoiceChannel } from "discord.js";

export function voiceKickPicker(channel: VoiceChannel, ownerId: string, panelId: string, requestedPage = 0) {
  // Dev note: The guild is a big party; this guest list stays inside the room.
  const members = [...channel.members.values()].filter((member) => member.id !== ownerId && member.id !== channel.client.user?.id);
  if (!members.length) return { content: "There are no other members in your room to disconnect.", components: [] };
  const pages = Math.ceil(members.length / 25);
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const suffix = `${channel.id}:${panelId}`;
  const components: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`voice-member:kick:${suffix}`).setPlaceholder("Disconnect a member in your room").setMinValues(1).setMaxValues(1)
      .addOptions(members.slice(page * 25, (page + 1) * 25).map((member) => ({
        label: member.displayName.slice(0, 100), value: member.id, description: member.user.username.slice(0, 100),
      })))),
  ];
  if (pages > 1) components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`voice-kick-page:${suffix}:${page - 1}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`voice-kick-page:${suffix}:${page + 1}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
  ));
  return { content: `Choose a member currently in your room to disconnect.${pages > 1 ? ` Page ${page + 1}/${pages}.` : ""}`, components };
}
