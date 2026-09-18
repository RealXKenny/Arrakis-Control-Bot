import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { UserSelectMenuInteraction, StringSelectMenuInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../support/interactions/RateLimitedInteractionHandler";
import { runVoiceInteraction } from "../../modules/voice/voiceInteractions";

type VoiceMemberInteraction = UserSelectMenuInteraction | StringSelectMenuInteraction;

export async function selectVoiceMember(interaction: VoiceMemberInteraction): Promise<void> {
  await interaction.deferUpdate();
  await runVoiceInteraction(interaction, async (service) => {
    const [, action, roomId, panelId] = interaction.customId.split(":");
    await service.control(interaction.guild!, interaction.user.id, action as "permit" | "reject" | "kick", interaction.values[0], interaction.channelId, roomId, panelId);
    await interaction.editReply({ content: "Your room's member settings were updated.", components: [] });
  });
}

export class VoiceMemberMenu extends RateLimitedInteractionHandler<VoiceMemberInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
  }

  public override parse(interaction: VoiceMemberInteraction) {
    const matched = interaction.isUserSelectMenu() ? /^voice-member:(permit|reject):\d+:\d+$/.test(interaction.customId)
      : interaction.isStringSelectMenu() && /^voice-member:kick:\d+:\d+$/.test(interaction.customId);
    return matched ? this.some() : this.none();
  }

  protected override handle(interaction: VoiceMemberInteraction): Promise<void> {
    return selectVoiceMember(interaction);
  }
}
