import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";

const OWNER_ERROR_MESSAGE = "Only the configured owner role can reload bot modules.";

class OwnerRoleOnly extends Precondition {
  public constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
    super(context, { ...options, name: "OwnerRoleOnly" });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction): Precondition.AsyncResult {
    const ownerRoleId = process.env.OWNER_ROLE_ID;

    if (!ownerRoleId || !interaction.guild) {
      return this.error({ identifier: "OwnerRoleOnly", message: OWNER_ERROR_MESSAGE });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    return member?.roles.cache.has(ownerRoleId) ? this.ok() : this.error({ identifier: "OwnerRoleOnly", message: OWNER_ERROR_MESSAGE });
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    OwnerRoleOnly: never;
  }
}

export { OWNER_ERROR_MESSAGE, OwnerRoleOnly };
