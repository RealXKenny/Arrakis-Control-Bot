import { Precondition } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";

import { hasStaffRole } from "../shared/utils/staffAccess";

const STAFF_ERROR_MESSAGE = "You need a configured staff role to use this command.";

class StaffOnly extends Precondition {
  public constructor(context: Precondition.LoaderContext, options: Precondition.Options) {
    super(context, { ...options, name: "StaffOnly" });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction): Precondition.AsyncResult {
    if (!interaction.guild) {
      return this.ok();
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    return hasStaffRole(member) ? this.ok() : this.error({ identifier: "StaffOnly", message: STAFF_ERROR_MESSAGE });
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    StaffOnly: never;
  }
}

export { STAFF_ERROR_MESSAGE, StaffOnly };
