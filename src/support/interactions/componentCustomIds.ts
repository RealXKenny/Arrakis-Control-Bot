import type { Interaction } from "discord.js";

const BUTTON_IDS = [
  "music:lyrics", "music:request", "music:now", "music:queue", "music:pause", "music:resume", "music:skip",
  "music:volume", "music:clear", "music:stop", "music:cancel", "music-confirm:stop", "music-confirm:clear",
  "voice:rename", "voice:limit", "voice:lock", "voice:unlock", "voice:hide", "voice:show",
  "voice:permit", "voice:reject", "voice:kick", "voice:delete",
  "voice:info", "voice:reset",
  "blueprint-upload",
  "member-captcha",
  "player-link",
  "player-unlink",
  "player-verify",
  "ticket-claim",
  "ticket-close",
  "ticket-open",
  "ticket-review",
  "ticket-unclaim",
  "bot-control:status", "bot-control:refresh-panels", "bot-control:reload", "bot-control:resync",
  "bot-control:restart", "bot-control:restart-confirm", "bot-control:cancel",
  "staff-application:open",
] as const;
const BUTTON_PREFIXES = ["voice-kick-page:", "voice-reset:", "voice-close:", "voice-cancel:", "help-page:", "market-page:", "ticket-claim:", "ticket-review:", "ticket-unclaim:", "staff-application:accept:", "staff-application:deny:"] as const;
const MENU_IDS = ["self-assignable-roles", "ticket-category"] as const;
const MENU_PREFIXES = ["voice-member:", "help-category:", "market-category:"] as const;
const MODAL_IDS = [
  "music-edit:request", "music-edit:volume",
  "blueprint-upload-modal",
  "member-captcha-modal",
  "player-link-modal",
  "player-verify-modal",
  "ticket-create-modal",
  "ticket-review-modal",
] as const;
const MODAL_PREFIXES = ["voice-edit:", "ticket-create-modal:", "ticket-review-modal:", "staff-application:submit", "staff-application-review:"] as const;

function matchesCustomId(customId: string, exactId: string, prefix?: string): boolean {
  return customId === exactId || Boolean(prefix && customId.startsWith(prefix));
}

function isKnownComponentInteraction(interaction: Interaction): boolean {
  if (interaction.isButton()) {
    if (/^music:lyrics:[\w-]{1,36}:\d{1,3}$/.test(interaction.customId)) return true;
    return BUTTON_IDS.includes(interaction.customId as (typeof BUTTON_IDS)[number]) || BUTTON_PREFIXES.some((prefix) => interaction.customId.startsWith(prefix));
  }

  if (interaction.isAnySelectMenu()) {
    return MENU_IDS.includes(interaction.customId as (typeof MENU_IDS)[number]) || MENU_PREFIXES.some((prefix) => interaction.customId.startsWith(prefix));
  }

  if (interaction.isModalSubmit()) {
    return MODAL_IDS.includes(interaction.customId as (typeof MODAL_IDS)[number]) || MODAL_PREFIXES.some((prefix) => interaction.customId.startsWith(prefix));
  }

  return false;
}

export { isKnownComponentInteraction, matchesCustomId };
