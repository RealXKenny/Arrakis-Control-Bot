import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown, MessageFlags, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, type ButtonInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../support/interactions/RateLimitedInteractionHandler";
import { VOICE_BUTTON_ACTIONS } from "../../modules/voice/voicePanel";
import { runVoiceInteraction } from "../../modules/voice/voiceInteractions";
import { voiceKickPicker } from "../../modules/voice/voiceKickPicker";

export class VoiceButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    return VOICE_BUTTON_ACTIONS.some((action) => interaction.customId === `voice:${action}`) || /^voice-kick-page:\d+:\d+:-?\d+$/.test(interaction.customId) ? this.some() : this.none();
  }

  protected override async handle(interaction: ButtonInteraction): Promise<void> {
    await runVoiceInteraction(interaction, async (service) => {
      if (interaction.customId.startsWith("voice-kick-page:")) {
        await interaction.deferUpdate();
        const [, roomId, panelId, page] = interaction.customId.split(":");
        const { channel } = await service.authorize(interaction.guild!, interaction.user.id, interaction.channelId, roomId, panelId);
        await interaction.editReply(voiceKickPicker(channel, interaction.user.id, panelId, Number(page)));
        return;
      }
      const action = interaction.customId.slice(6) as typeof VOICE_BUTTON_ACTIONS[number];
      if (action === "rename" || action === "limit") {
        const { channel } = await service.authorize(interaction.guild!, interaction.user.id, interaction.channelId, undefined, interaction.message.id);
        const input = new TextInputBuilder().setCustomId("value").setLabel(action === "rename" ? "Room name" : "User limit (0–99; 0 = unlimited)")
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(action === "rename" ? 100 : 2)
          .setValue(action === "rename" ? channel.name : String(channel.userLimit));
        await interaction.showModal(new ModalBuilder().setCustomId(`voice-edit:${action}:${channel.id}`).setTitle(action === "rename" ? "Rename Your Room" : "Room User Limit")
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
      } else if (action === "info") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { channel } = await service.authorize(interaction.guild!, interaction.user.id, interaction.channelId, undefined, interaction.message.id);
        const defaults = channel.permissionsFor(interaction.guild!.roles.everyone);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xc58b45).setTitle("Your Voice Room").addFields(
          { name: "Name", value: escapeMarkdown(channel.name) },
          { name: "Members", value: String(channel.members.size), inline: true },
          { name: "User limit", value: channel.userLimit ? String(channel.userLimit) : "Unlimited", inline: true },
          { name: "Default access", value: defaults?.has(PermissionFlagsBits.Connect) ? "Open" : "Restricted", inline: true },
          { name: "Default visibility", value: defaults?.has(PermissionFlagsBits.ViewChannel) ? "Visible" : "Hidden", inline: true },
        ).setFooter({ text: "Explicit member permissions and administrator access may differ." })] });
      } else if (action === "permit" || action === "reject" || action === "kick" || action === "delete" || action === "reset") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { channel } = await service.authorize(interaction.guild!, interaction.user.id, interaction.channelId, undefined, interaction.message.id);
        const suffix = `${channel.id}:${interaction.message.id}`;
        if (action === "delete" || action === "reset") {
          const reset = action === "reset";
          await interaction.editReply({
            content: reset ? "Reset your room's name, remove its user limit, and restore its original role access and visibility? Individually permitted or rejected members keep their settings." : "Close your voice room? This deletes the channel and disconnects everyone in it.",
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId(`voice-${reset ? "reset" : "close"}:${suffix}`).setLabel(reset ? "Reset My Room" : "Close My Room").setStyle(reset ? ButtonStyle.Primary : ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`voice-cancel:${suffix}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
            )],
          });
        } else if (action === "kick") {
          await interaction.editReply(voiceKickPicker(channel, interaction.user.id, interaction.message.id));
        } else {
          await interaction.editReply({
            content: action === "permit" ? "Choose a member to allow into your room." : action === "reject" ? "Choose a member to remove access from your room." : "Choose a member currently in your room to disconnect.",
            components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder()
              .setCustomId(`voice-member:${action}:${suffix}`).setPlaceholder("Choose a member").setMinValues(1).setMaxValues(1))],
          });
        }
      } else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await service.control(interaction.guild!, interaction.user.id, action, undefined, interaction.channelId, undefined, interaction.message.id);
        await interaction.editReply("Your voice room was updated.");
      }
    });
  }
}
