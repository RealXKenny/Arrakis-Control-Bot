import { Events, GuildMember, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } from "discord.js";

import { createContainer, createV2Response } from "../../../shared/factories/componentFactory";
import { createMemberBanner } from "../../../shared/factories/imageFactory";

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member: GuildMember): Promise<void> {
    const { auditLogger } = member.client;

    if (auditLogger) {
      await auditLogger.sendTo(auditLogger.activityChannelId, "Member joined", [`**User:** ${member.user.tag} (${member.id})`, `**Guild:** ${member.guild.name}`]);
    }

    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;

    if (!welcomeChannelId) {
      return;
    }

    const channel = await member.guild.channels.fetch(welcomeChannelId);

    if (!channel?.isTextBased()) {
      return;
    }

    const banner = await createMemberBanner({
      filename: "member-welcome.png",
      title: "Welcome",
      member,
    });

    const mediaGallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://member-welcome.png"));

    const container = createContainer({
      title: "## Welcome to Arrakis!",
      body: `Welcome ${member} to **${member.guild.name}**.\n\n` + "Prepare yourself for the spice and watch the sands carefully.",
      color: 0xc58b45,
    }).addMediaGalleryComponents(mediaGallery);

    const response = createV2Response([container], [banner]);

    await channel.send({
      components: response.components,
      files: response.files,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        users: [member.id],
      },
    });
  },
};
