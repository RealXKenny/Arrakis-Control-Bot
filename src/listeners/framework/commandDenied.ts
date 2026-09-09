import { Events, Listener, type ChatInputCommandDeniedPayload, type UserError } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, type ChatInputCommandInteraction } from "discord.js";

import { createV2Response } from "../../shared/factories/componentFactory";

async function respondToCommandDenial(error: UserError, interaction: ChatInputCommandInteraction): Promise<void> {
  if (error.identifier === "StaffOnly") {
    const card = new ContainerBuilder()
      .setAccentColor(0x8f3025)
      .addTextDisplayComponents((text) => text.setContent("## 🔒 Permission Denied"))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(error.message));

    if (interaction.deferred || interaction.replied) await interaction.editReply(createV2Response([card]));
    else await interaction.reply(createV2Response([card]));
    return;
  }

  if (interaction.deferred || interaction.replied) await interaction.editReply({ content: error.message });
  else await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
}

class CommandDenied extends Listener<typeof Events.ChatInputCommandDenied> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ChatInputCommandDenied });
  }
  public override async run(error: UserError, { interaction }: ChatInputCommandDeniedPayload): Promise<void> {
    await respondToCommandDenial(error, interaction);
  }
}

export { CommandDenied, respondToCommandDenial };
