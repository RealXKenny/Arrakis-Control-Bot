import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../support/interactions/RateLimitedInteractionHandler";
import { handleMusicInteraction } from "../../modules/music/musicInteractions";

export class MusicModal extends RateLimitedInteractionHandler<ModalSubmitInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }
  public override parse(interaction: ModalSubmitInteraction) {
    return ["music-edit:request", "music-edit:volume"].includes(interaction.customId) ? this.some() : this.none();
  }
  protected override async handle(interaction: ModalSubmitInteraction): Promise<void> { await handleMusicInteraction(interaction); }
}
