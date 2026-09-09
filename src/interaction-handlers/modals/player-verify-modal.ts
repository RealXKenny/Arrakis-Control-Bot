import { InteractionHandler, InteractionHandlerTypes, container } from "@sapphire/framework";
import { MessageFlags, ModalSubmitInteraction } from "discord.js";

import { createActorContext } from "../../shared/utils/createActorContext";
import { truncateDiscordText } from "../../shared/utils/discordLimits";
import { RateLimitedInteractionHandler } from "../../support/RateLimitedInteractionHandler";
import { matchesCustomId } from "../../support/componentCustomIds";

const LINKED_ROLE_ID = process.env.LINKED_PLAYER_ROLE_ID;

interface VerifyPlayerLinkResult {
  ok?: boolean;
  message?: string | null;
  characterName?: string | null;
  character_name?: string | null;
  [key: string]: unknown;
}

const handler = {
  customId: "player-verify-modal",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const { discordAdapter, auditLogger } = container.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const code = interaction.fields.getTextInputValue("verification-code").trim().toUpperCase();

    const actor = createActorContext(interaction, "player-verify");

    const result = (await discordAdapter.verifyPlayerLink(actor, code)) as VerifyPlayerLinkResult;

    if (result?.ok) {
      await applyLinkedMemberProfile(interaction, result);
    }

    await interaction.editReply(truncateDiscordText(result?.message ?? "Your Dune character has been linked.", 1_900, "…"));

    if (result?.ok) {
      await auditLogger?.playerLinked(interaction, result);
    }
  },
};

class PlayerVerifyModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    return matchesCustomId(interaction.customId, handler.customId) ? this.some() : this.none();
  }

  protected override handle(interaction: ModalSubmitInteraction): Promise<void> {
    return handler.execute(interaction);
  }
}

export { PlayerVerifyModal };

async function applyLinkedMemberProfile(interaction: ModalSubmitInteraction, result: VerifyPlayerLinkResult): Promise<void> {
  if (!interaction.guild) {
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (LINKED_ROLE_ID && !member.roles.cache.has(LINKED_ROLE_ID)) {
      await member.roles.add(LINKED_ROLE_ID, "Dune character account linked");
    }

    const characterName = String(result.characterName ?? result.character_name ?? "").trim();

    if (characterName && member.manageable && member.nickname !== characterName) {
      await member.setNickname(characterName, "Dune character account linked");
    }

    container.logger.info(`Applied linked role and nickname for ${interaction.user.tag}.`);
  } catch (error: unknown) {
    container.logger.warn(`Could not update Discord member profile for ${interaction.user.tag}; ` + "linking itself succeeded.", error);
  }
}
