import type { Interaction } from "discord.js";

const BUTTON_IDS = [
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
] as const;
const BUTTON_PREFIXES = ["ticket-claim:", "ticket-review:", "ticket-unclaim:"] as const;
const MENU_IDS = ["self-assignable-roles", "ticket-category"] as const;
const MODAL_IDS = [
  "blueprint-upload-modal",
  "member-captcha-modal",
  "player-link-modal",
  "player-verify-modal",
  "ticket-create-modal",
  "ticket-review-modal",
] as const;
const MODAL_PREFIXES = ["ticket-create-modal:", "ticket-review-modal:"] as const;

function matchesCustomId(customId: string, exactId: string, prefix?: string): boolean {
  return customId === exactId || Boolean(prefix && customId.startsWith(prefix));
}

function isKnownComponentInteraction(interaction: Interaction): boolean {
  if (interaction.isButton()) {
    return BUTTON_IDS.includes(interaction.customId as (typeof BUTTON_IDS)[number]) || BUTTON_PREFIXES.some((prefix) => interaction.customId.startsWith(prefix));
  }

  if (interaction.isAnySelectMenu()) {
    return MENU_IDS.includes(interaction.customId as (typeof MENU_IDS)[number]);
  }

  if (interaction.isModalSubmit()) {
    return MODAL_IDS.includes(interaction.customId as (typeof MODAL_IDS)[number]) || MODAL_PREFIXES.some((prefix) => interaction.customId.startsWith(prefix));
  }

  return false;
}

export { isKnownComponentInteraction, matchesCustomId };
