import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client } from "discord.js";

import { createDuneBanner } from "../../shared/factories/imageFactory.js";
import { findPanelMessage } from "../../shared/utils/findPanelMessage.js";

const PANEL_MARKER = "## Arrakis Community Rules";
const PANEL_IMAGE_NAME = "community-rules.png";

const RULES_TEXT = [
  "### 1. Respect and inclusion\nTreat every member with respect, regardless of background, identity, experience, or playstyle. Harassment, hate speech, threats, bullying, doxxing, discrimination, and targeted personal attacks are prohibited.",

  "### 2. Keep content appropriate\nKeep conversations safe for the community and use channels for their intended purpose. Do not post sexual, excessively graphic, shocking, or otherwise inappropriate content. Respect Discord's Terms of Service and Community Guidelines.",

  "### 3. No spam, scams, or malicious content\nDo not flood chats, abuse mentions, post chain messages, impersonate others, distribute scams, phishing links, malware, or suspicious files. Never request or share another member's private information.",

  "### 4. Fair play and server integrity\nDo not promote cheating, exploits, hacks, bot abuse, account theft, or methods intended to bypass Dune: Awakening or Discord systems. Report vulnerabilities privately to staff instead of exploiting or publicizing them.",

  "### 5. Use channels responsibly\nKeep support requests, recruiting, marketplace posts, announcements, and general conversation in the appropriate channels. Avoid unsolicited advertising, repeated self-promotion, and disruptive arguments.",

  "### 6. Voice and event etiquette\nAllow others to participate, avoid excessive noise or soundboards, and follow event-specific instructions. Do not stream private conversations or record members without their consent.",

  "### 7. Staff and moderation\nFollow reasonable staff instructions during moderation or events. Do not evade mutes, bans, or other actions with alternate accounts. If you disagree with a decision, appeal calmly through the designated support channel rather than arguing publicly.",

  "### 8. Privacy and safety\nProtect your account, tokens, and personal information. Staff will never ask for your password or authentication codes. Report suspicious accounts, links, or messages to the moderation team immediately.",

  "### 9. Enforcement\nViolations may result in a warning, message removal, timeout, kick, ban, or referral to Discord or platform authorities. Actions are based on severity, context, and repeat behavior; staff may act on conduct that harms the community even if it is not listed word-for-word above.",

  "### 10. Be a good community member\nChoose your roles, help new players, share useful knowledge, and contribute to a welcoming Dune community. By participating, you agree to follow these rules and any channel-specific guidelines.",
].join("\n\n");

function buildRulesPanel(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Arrakis community rules banner")))
    .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
    .addTextDisplayComponents((text) => text.setContent(RULES_TEXT));
}

async function ensureRulesPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot create rules panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Rules panel channel ${channelId} is not a sendable channel.`);
  }

  const existingPanel = await findPanelMessage(channel, client.user.id, PANEL_MARKER);

  if (existingPanel) {
    const banner = createDuneBanner({
      filename: PANEL_IMAGE_NAME,
      title: "Rules",
      subtitle: "COMMUNITY GUIDELINES",
      detail: "RESPECT • PLAY FAIR • ENJOY ARRAKIS",
    });

    await existingPanel.edit({
      content: null,
      embeds: [],
      components: [buildRulesPanel()],
      files: [
        {
          attachment: banner.attachment,
          name: PANEL_IMAGE_NAME,
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    return;
  }

  const banner = createDuneBanner({
    filename: PANEL_IMAGE_NAME,
    title: "Rules",
    subtitle: "COMMUNITY GUIDELINES",
    detail: "RESPECT • PLAY FAIR • ENJOY ARRAKIS",
  });

  await channel.send({
    components: [buildRulesPanel()],
    files: [banner],
    flags: MessageFlags.IsComponentsV2,
  });
}

export { ensureRulesPanel };
