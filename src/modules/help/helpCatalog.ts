import { PLAYER_ADMIN_COMMAND_NAMES } from "../../support/commands/playerAdminCommandFactory";

type HelpAccess = "Everyone" | "Staff" | "Owner";

interface HelpCommandEntry {
  name: string;
  access?: HelpAccess;
}

interface HelpCategory {
  id: string;
  label: string;
  description: string;
  emoji: string;
  access: HelpAccess;
  commands: HelpCommandEntry[];
}

function playerCommands(group: string): HelpCommandEntry[] {
  return Object.entries(PLAYER_ADMIN_COMMAND_NAMES)
    .filter(([key]) => key.startsWith(`${group}.`))
    .map(([, name]) => ({ name }));
}

const HELP_CATEGORIES: readonly HelpCategory[] = [
  { id: "general", label: "General", description: "Bot information and member utilities.", emoji: "📖", access: "Everyone", commands: [{ name: "help" }, { name: "info" }, { name: "ping" }, { name: "userinfo" }] },
  { id: "community", label: "Community & World", description: "Players, profiles, the market, and Arrakis events.", emoji: "🏜️", access: "Everyone", commands: [{ name: "players" }, { name: "profile" }, { name: "market" }, { name: "storm" }] },
  { id: "moderation", label: "Moderation", description: "Discord member and message moderation.", emoji: "🛡️", access: "Staff", commands: [{ name: "ban" }, { name: "kick" }, { name: "timeout" }, { name: "purge" }] },
  { id: "player-items", label: "Player Items & Skills", description: "Grant items, XP, skills, and hydration.", emoji: "🎒", access: "Owner", commands: playerCommands("items") },
  { id: "player-actions", label: "Player Actions", description: "Game kicks, bans, teleports, login repair, and vehicles.", emoji: "🎯", access: "Owner", commands: playerCommands("actions") },
  { id: "player-progression", label: "Player Progression", description: "Currency, factions, specializations, journeys, and unlocks.", emoji: "📈", access: "Owner", commands: playerCommands("progression") },
  { id: "player-equipment", label: "Player Equipment", description: "Repair, refuel, and augment player equipment.", emoji: "🔧", access: "Owner", commands: playerCommands("equipment") },
  { id: "player-inventory", label: "Player Inventory", description: "Direct inventory item editing.", emoji: "📦", access: "Owner", commands: playerCommands("inventory") },
  { id: "player-resets", label: "Player Resets & Bulk", description: "Character cleanup, progression reset, and bulk actions.", emoji: "⚠️", access: "Owner", commands: [...playerCommands("reset"), ...playerCommands("bulk")] },
  { id: "backups", label: "Backups", description: "Inspect, create, restore, import, and configure backups.", emoji: "💾", access: "Owner", commands: [{ name: "backups", access: "Everyone" }, { name: "create-backup" }, { name: "restore-backup" }, { name: "download-backup" }, { name: "delete-backup" }, { name: "delete-all-backups" }, { name: "import-backup" }, { name: "configure-auto-backup" }] },
  { id: "server-operations", label: "Server Operations", description: "Lifecycle, services, networking, and storage maintenance.", emoji: "🖥️", access: "Owner", commands: [{ name: "start-server" }, { name: "stop-server" }, { name: "restart-server" }, { name: "services" }, { name: "restart-service" }, { name: "fix-network" }, { name: "cleanup-images" }, { name: "cleanup-build-cache" }] },
  { id: "server-monitoring", label: "Server Monitoring", description: "Live Dune and VPS status information.", emoji: "📡", access: "Everyone", commands: [{ name: "status" }, { name: "servers" }] },
  { id: "updates", label: "Updates", description: "Game, stack, SteamCMD, and runtime update controls.", emoji: "🔄", access: "Owner", commands: [{ name: "check-game-update" }, { name: "apply-game-update" }, { name: "auto-update-status" }, { name: "configure-auto-update" }, { name: "check-stack-update" }, { name: "apply-stack-update" }, { name: "fix-steamcmd" }, { name: "repair-runtime" }] },
  { id: "administration", label: "Bot Administration", description: "Owner-only bot process administration.", emoji: "⚙️", access: "Owner", commands: [{ name: "reload" }] },
];

function getHelpCategory(id: string): HelpCategory | null {
  return HELP_CATEGORIES.find((category) => category.id === id) ?? null;
}

export { HELP_CATEGORIES, getHelpCategory };
export type { HelpAccess, HelpCategory, HelpCommandEntry };
