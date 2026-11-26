import { Events, Listener } from "@sapphire/framework";
import type { Guild } from "discord.js";

import { scopedLogger } from "../../client/logger";
import { leaveIfUnauthorized } from "../../modules/administration/guildAllowlist";

class GuildCreate extends Listener<typeof Events.GuildCreate> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.GuildCreate });
  }

  public override async run(guild: Guild): Promise<void> {
    await leaveIfUnauthorized(this.container.client, guild, this.container.client.allowedGuildIds, scopedLogger(this.container.logger, "SECURITY"));
  }
}

export { GuildCreate };
