import { ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { createDuneBanner } from "../../shared/discord/imageFactory";

export const VOICE_BUTTON_ACTIONS = ["rename", "limit", "lock", "unlock", "hide", "show", "permit", "reject", "kick", "delete", "info", "reset"] as const;
type VoiceButtonAction = typeof VOICE_BUTTON_ACTIONS[number];

const BUTTONS: Record<VoiceButtonAction, { label: string; emoji: string; style: ButtonStyle }> = {
  rename: { label: "Rename Room", emoji: "✏️", style: ButtonStyle.Primary },
  limit: { label: "Set User Limit", emoji: "👥", style: ButtonStyle.Primary },
  lock: { label: "Lock Room", emoji: "🔒", style: ButtonStyle.Secondary },
  unlock: { label: "Unlock Room", emoji: "🔓", style: ButtonStyle.Success },
  hide: { label: "Hide Room", emoji: "🌙", style: ButtonStyle.Secondary },
  show: { label: "Show Room", emoji: "👁️", style: ButtonStyle.Success },
  permit: { label: "Permit Member", emoji: "➕", style: ButtonStyle.Success },
  reject: { label: "Reject Member", emoji: "🚫", style: ButtonStyle.Secondary },
  kick: { label: "Disconnect Member", emoji: "👢", style: ButtonStyle.Secondary },
  delete: { label: "Close Room", emoji: "🗑️", style: ButtonStyle.Danger },
  info: { label: "Room Info", emoji: "ℹ️", style: ButtonStyle.Secondary },
  reset: { label: "Reset Settings", emoji: "↩️", style: ButtonStyle.Secondary },
};

function button(action: VoiceButtonAction): ButtonBuilder {
  const { label, emoji, style } = BUTTONS[action];
  return new ButtonBuilder().setCustomId(`voice:${action}`).setLabel(label).setEmoji(emoji).setStyle(style);
}

export function voicePanel(joinChannelId?: string) {
  const joinChannel = joinChannelId ? `<#${joinChannelId}>` : "the **Join to Create** channel";
  const filename = "voice-lounge.png";
  const banner = createDuneBanner({ artwork: "voice", filename, title: "Voice Lounge", subtitle: "ARRAKIS CONTROL", detail: "YOUR ROOM. YOUR CREW." });
  const panel = new ContainerBuilder().setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`).setDescription("Arrakis Control — Voice Lounge")))
    .addTextDisplayComponents((text) => text.setContent("## Make room for your crew\nA place to plan your next expedition or just hang out."))
    .addTextDisplayComponents((text) => text.setContent(`**1. Join** ${joinChannel}\n**2. Get your room** — we create it and move you in.\n**3. Make it yours** — stay connected and use the controls below.`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("### ✦ Room settings\nChoose a name and how many people can join. A limit of **0** means unlimited."))
    .addActionRowComponents((row) => row.addComponents(button("rename"), button("limit")))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("### ✦ Access & visibility\n**Lock** stops new arrivals. **Hide** removes your room from the channel list for other members. Explicitly permitted members retain access."))
    .addActionRowComponents((row) => row.addComponents(button("lock"), button("unlock")))
    .addActionRowComponents((row) => row.addComponents(button("hide"), button("show")))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("### ✦ Manage your crew\n**Permit** lets a member join. **Reject** removes their access. **Disconnect** removes them from the call. **Close Room** deletes your room after confirmation."))
    .addActionRowComponents((row) => row.addComponents(button("permit"), button("reject"), button("kick")))
    .addActionRowComponents((row) => row.addComponents(button("delete"), button("info"), button("reset")))
    .addTextDisplayComponents((text) => text.setContent("-# Everyone can see this panel. Only the creator, while connected to their own room, can use its controls. Rooms close automatically when empty."));

  return {
    components: [panel],
    files: [banner],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [] as never[] },
  };
}
