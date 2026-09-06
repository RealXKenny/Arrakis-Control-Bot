import { Events, GuildMember, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } from "discord.js";

import { createContainer, createV2Response } from "../../../shared/factories/componentFactory";
import { createMemberBanner } from "../../../shared/factories/imageFactory";

module.exports = {
  name: Events.GuildMemberRemove,

  async execute(member: GuildMember): Promise<void> {
    const { auditLogger } = member.client;

    await auditLogger?.sendTo(auditLogger.activityChannelId, "Member left", [`**User:** ${member.user.tag} (${member.id})`, `**Guild:** ${member.guild.name}`]);

    const goodbyeChannelId = process.env.GOODBYE_CHANNEL_ID;

    if (!goodbyeChannelId) {
      return;
    }

    const channel = await member.guild.channels.fetch(goodbyeChannelId);

    if (!channel?.isTextBased()) {
      return;
    }

    const banner = await createMemberBanner({
      filename: "member-goodbye.png",
      title: "Goodbye",
      member,
    });

    const mediaGallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://member-goodbye.png"));

    const container = createContainer({
      title: "## A Traveler Has Departed",
      body: `**${member.user.tag}** has left **${member.guild.name}**.\n\n` + "May the winds of Arrakis guide their journey.",
      color: 0xc58b45,
    }).addMediaGalleryComponents(mediaGallery);

    const response = createV2Response([container], [banner]);

    await channel.send({
      components: response.components,
      files: response.files,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        parse: [],
      },
    });
  },
};
