import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { RateLimitedInteractionHandler } from "../../support/interactions/RateLimitedInteractionHandler";
import { MUSIC_BUTTON_ACTIONS } from "../../modules/music/musicPanel";
import { handleMusicInteraction } from "../../modules/music/musicInteractions";

export class MusicButton extends RateLimitedInteractionHandler<ButtonInteraction> {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }
  public override parse(interaction: ButtonInteraction) {
    if (/^music:lyrics:[\w-]{1,36}:\d{1,3}$/.test(interaction.customId)) return this.some();
    return MUSIC_BUTTON_ACTIONS.some((action) => interaction.customId === `music:${action}`) || ["music:cancel", "music-confirm:stop", "music-confirm:clear"].includes(interaction.customId) ? this.some() : this.none();
  }
  protected override async handle(interaction: ButtonInteraction): Promise<void> { await handleMusicInteraction(interaction); }
}
