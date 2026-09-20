import { Events, Listener } from "@sapphire/framework";
import type { VoiceState } from "discord.js";
import { scopedLogger } from "../../client/logger";

export class VoiceStateUpdate extends Listener<typeof Events.VoiceStateUpdate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.VoiceStateUpdate });
  }

  public override async run(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try { await this.container.client.music?.onVoiceState(oldState, newState); }
    catch { scopedLogger(this.container.logger, "MUSIC").warn("Unable to update music voice mutes; recovery will retry."); }
    try { await this.container.client.voiceRooms?.onVoiceState(oldState, newState); }
    catch (error) { scopedLogger(this.container.logger, "VOICE").error("Unable to update temporary voice rooms; recovery will retry.", error); }
  }
}
