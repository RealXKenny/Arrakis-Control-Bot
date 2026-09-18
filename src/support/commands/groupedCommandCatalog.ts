import { groupedAction as administrationOperationsReload } from "../../command-actions/administration/operations/reload";
import { groupedAction as generalInformationInfo } from "../../command-actions/general/information/info";
import { groupedAction as generalInformationPing } from "../../command-actions/general/information/ping";
import { groupedAction as generalInformationUserinfo } from "../../command-actions/general/information/userinfo";
import { groupedAction as moderationMembersBan } from "../../command-actions/moderation/members/ban";
import { groupedAction as moderationMembersKick } from "../../command-actions/moderation/members/kick";
import { groupedAction as moderationMembersTimeout } from "../../command-actions/moderation/members/timeout";
import { groupedAction as moderationMessagesPurge } from "../../command-actions/moderation/messages/purge";
import { groupedAction as playersActionsBanPlayer } from "../../command-actions/players/actions/ban-player";
import { groupedAction as playersActionsKickPlayer } from "../../command-actions/players/actions/kick-player";
import { groupedAction as playersActionsPlayerBanStatus } from "../../command-actions/players/actions/player-ban-status";
import { groupedAction as playersActionsRepairLoginQueue } from "../../command-actions/players/actions/repair-login-queue";
import { groupedAction as playersActionsSpawnPlayerVehicle } from "../../command-actions/players/actions/spawn-player-vehicle";
import { groupedAction as playersActionsTeleportPlayer } from "../../command-actions/players/actions/teleport-player";
import { groupedAction as playersActionsUnbanPlayer } from "../../command-actions/players/actions/unban-player";
import { groupedAction as playersBulkKickAllOnline } from "../../command-actions/players/bulk/kick-all-online";
import { groupedAction as playersDirectoryPlayers } from "../../command-actions/players/directory/players";
import { groupedAction as playersDirectoryProfile } from "../../command-actions/players/directory/profile";
import { groupedAction as playersEquipmentAugmentPlayerItem } from "../../command-actions/players/equipment/augment-player-item";
import { groupedAction as playersEquipmentRefuelPlayerVehicle } from "../../command-actions/players/equipment/refuel-player-vehicle";
import { groupedAction as playersEquipmentRepairPlayerGear } from "../../command-actions/players/equipment/repair-player-gear";
import { groupedAction as playersEquipmentRepairVehicleDecay } from "../../command-actions/players/equipment/repair-vehicle-decay";
import { groupedAction as playersInventoryDeleteInventoryItem } from "../../command-actions/players/inventory/delete-inventory-item";
import { groupedAction as playersInventoryModifyInventoryItem } from "../../command-actions/players/inventory/modify-inventory-item";
import { groupedAction as playersItemsAddPlayerXp } from "../../command-actions/players/items/add-player-xp";
import { groupedAction as playersItemsGiveItemId } from "../../command-actions/players/items/give-item-id";
import { groupedAction as playersItemsGiveItem } from "../../command-actions/players/items/give-item";
import { groupedAction as playersItemsGiveItems } from "../../command-actions/players/items/give-items";
import { groupedAction as playersItemsRefillPlayerWater } from "../../command-actions/players/items/refill-player-water";
import { groupedAction as playersItemsSetSkillModule } from "../../command-actions/players/items/set-skill-module";
import { groupedAction as playersItemsSetSkillPoints } from "../../command-actions/players/items/set-skill-points";
import { groupedAction as playersProgressionAddFactionReputation } from "../../command-actions/players/progression/add-faction-reputation";
import { groupedAction as playersProgressionAddPlayerCurrency } from "../../command-actions/players/progression/add-player-currency";
import { groupedAction as playersProgressionAddPlayerIntel } from "../../command-actions/players/progression/add-player-intel";
import { groupedAction as playersProgressionAddSpecializationXp } from "../../command-actions/players/progression/add-specialization-xp";
import { groupedAction as playersProgressionAssignPlayerFaction } from "../../command-actions/players/progression/assign-player-faction";
import { groupedAction as playersProgressionCompleteJourneyNode } from "../../command-actions/players/progression/complete-journey-node";
import { groupedAction as playersProgressionCompleteTutorial } from "../../command-actions/players/progression/complete-tutorial";
import { groupedAction as playersProgressionGrantAllKeystones } from "../../command-actions/players/progression/grant-all-keystones";
import { groupedAction as playersProgressionMaxSpecialization } from "../../command-actions/players/progression/max-specialization";
import { groupedAction as playersProgressionResetAllKeystones } from "../../command-actions/players/progression/reset-all-keystones";
import { groupedAction as playersProgressionResetJourneyNode } from "../../command-actions/players/progression/reset-journey-node";
import { groupedAction as playersProgressionResetSpecialization } from "../../command-actions/players/progression/reset-specialization";
import { groupedAction as playersProgressionResetTutorial } from "../../command-actions/players/progression/reset-tutorial";
import { groupedAction as playersProgressionUnlockCraftingRecipe } from "../../command-actions/players/progression/unlock-crafting-recipe";
import { groupedAction as playersProgressionUnlockPlayerResearch } from "../../command-actions/players/progression/unlock-player-research";
import { groupedAction as playersResetCleanPlayerInventory } from "../../command-actions/players/reset/clean-player-inventory";
import { groupedAction as playersResetResetPlayerProgression } from "../../command-actions/players/reset/reset-player-progression";
import { groupedAction as serverBackupsBackups } from "../../command-actions/server/backups/backups";
import { groupedAction as serverBackupsConfigureAutoBackup } from "../../command-actions/server/backups/configure-auto-backup";
import { groupedAction as serverBackupsCreateBackup } from "../../command-actions/server/backups/create-backup";
import { groupedAction as serverBackupsDeleteAllBackups } from "../../command-actions/server/backups/delete-all-backups";
import { groupedAction as serverBackupsDeleteBackup } from "../../command-actions/server/backups/delete-backup";
import { groupedAction as serverBackupsDownloadBackup } from "../../command-actions/server/backups/download-backup";
import { groupedAction as serverBackupsImportBackup } from "../../command-actions/server/backups/import-backup";
import { groupedAction as serverBackupsRestoreBackup } from "../../command-actions/server/backups/restore-backup";
import { groupedAction as serverLifecycleRestartServer } from "../../command-actions/server/lifecycle/restart-server";
import { groupedAction as serverLifecycleStartServer } from "../../command-actions/server/lifecycle/start-server";
import { groupedAction as serverLifecycleStopServer } from "../../command-actions/server/lifecycle/stop-server";
import { groupedAction as serverMaintenanceCleanupBuildCache } from "../../command-actions/server/maintenance/cleanup-build-cache";
import { groupedAction as serverMaintenanceCleanupImages } from "../../command-actions/server/maintenance/cleanup-images";
import { groupedAction as serverMaintenanceFixNetwork } from "../../command-actions/server/maintenance/fix-network";
import { groupedAction as serverMonitoringServers } from "../../command-actions/server/monitoring/servers";
import { groupedAction as serverMonitoringStatus } from "../../command-actions/server/monitoring/status";
import { groupedAction as serverServicesRestartService } from "../../command-actions/server/services/restart-service";
import { groupedAction as serverServicesServices } from "../../command-actions/server/services/services";
import { groupedAction as updatesGameApplyGameUpdate } from "../../command-actions/updates/game/apply-game-update";
import { groupedAction as updatesGameAutoUpdateStatus } from "../../command-actions/updates/game/auto-update-status";
import { groupedAction as updatesGameCheckGameUpdate } from "../../command-actions/updates/game/check-game-update";
import { groupedAction as updatesGameConfigureAutoUpdate } from "../../command-actions/updates/game/configure-auto-update";
import { groupedAction as updatesRuntimeFixSteamcmd } from "../../command-actions/updates/runtime/fix-steamcmd";
import { groupedAction as updatesRuntimeRepairRuntime } from "../../command-actions/updates/runtime/repair-runtime";
import { groupedAction as updatesStackApplyStackUpdate } from "../../command-actions/updates/stack/apply-stack-update";
import { groupedAction as updatesStackCheckStackUpdate } from "../../command-actions/updates/stack/check-stack-update";

export const GROUPED_ACTIONS = [
  { legacy: "reload", group: "bot", subgroup: null, name: "reload", access: "Owner", ...administrationOperationsReload },
  { legacy: "info", group: "bot", subgroup: null, name: "info", access: "Everyone", ...generalInformationInfo },
  { legacy: "ping", group: "bot", subgroup: null, name: "ping", access: "Everyone", ...generalInformationPing },
  { legacy: "userinfo", group: "bot", subgroup: null, name: "userinfo", access: "Everyone", ...generalInformationUserinfo },
  { legacy: "ban", group: "moderation", subgroup: null, name: "ban", access: "Staff", ...moderationMembersBan },
  { legacy: "kick", group: "moderation", subgroup: null, name: "kick", access: "Staff", ...moderationMembersKick },
  { legacy: "timeout", group: "moderation", subgroup: null, name: "timeout", access: "Staff", ...moderationMembersTimeout },
  { legacy: "purge", group: "moderation", subgroup: null, name: "purge", access: "Staff", ...moderationMessagesPurge },
  { legacy: "ban-player", group: "player", subgroup: "actions", name: "ban", access: "Owner", ...playersActionsBanPlayer },
  { legacy: "kick-player", group: "player", subgroup: "actions", name: "kick", access: "Owner", ...playersActionsKickPlayer },
  { legacy: "player-ban-status", group: "player", subgroup: "actions", name: "ban-status", access: "Owner", ...playersActionsPlayerBanStatus },
  { legacy: "repair-login-queue", group: "player", subgroup: "actions", name: "repair-login-queue", access: "Owner", ...playersActionsRepairLoginQueue },
  { legacy: "spawn-player-vehicle", group: "player", subgroup: "actions", name: "spawn-vehicle", access: "Owner", ...playersActionsSpawnPlayerVehicle },
  { legacy: "teleport-player", group: "player", subgroup: "actions", name: "teleport", access: "Owner", ...playersActionsTeleportPlayer },
  { legacy: "unban-player", group: "player", subgroup: "actions", name: "unban", access: "Owner", ...playersActionsUnbanPlayer },
  { legacy: "kick-all-online", group: "player", subgroup: "bulk", name: "kick-all-online", access: "Owner", ...playersBulkKickAllOnline },
  { legacy: "players", group: "player", subgroup: null, name: "list", access: "Everyone", ...playersDirectoryPlayers },
  { legacy: "profile", group: "player", subgroup: null, name: "profile", access: "Everyone", ...playersDirectoryProfile },
  { legacy: "augment-player-item", group: "player", subgroup: "equipment", name: "augment-item", access: "Owner", ...playersEquipmentAugmentPlayerItem },
  { legacy: "refuel-player-vehicle", group: "player", subgroup: "equipment", name: "refuel-vehicle", access: "Owner", ...playersEquipmentRefuelPlayerVehicle },
  { legacy: "repair-player-gear", group: "player", subgroup: "equipment", name: "repair-gear", access: "Owner", ...playersEquipmentRepairPlayerGear },
  { legacy: "repair-vehicle-decay", group: "player", subgroup: "equipment", name: "repair-vehicle-decay", access: "Owner", ...playersEquipmentRepairVehicleDecay },
  { legacy: "delete-inventory-item", group: "player", subgroup: "inventory", name: "delete-item", access: "Owner", ...playersInventoryDeleteInventoryItem },
  { legacy: "modify-inventory-item", group: "player", subgroup: "inventory", name: "modify-item", access: "Owner", ...playersInventoryModifyInventoryItem },
  { legacy: "add-player-xp", group: "player", subgroup: "items", name: "add-xp", access: "Owner", ...playersItemsAddPlayerXp },
  { legacy: "give-item-id", group: "player", subgroup: "items", name: "give-item-id", access: "Owner", ...playersItemsGiveItemId },
  { legacy: "give-item", group: "player", subgroup: "items", name: "give-item", access: "Owner", ...playersItemsGiveItem },
  { legacy: "give-items", group: "player", subgroup: "items", name: "give-items", access: "Owner", ...playersItemsGiveItems },
  { legacy: "refill-player-water", group: "player", subgroup: "items", name: "refill-water", access: "Owner", ...playersItemsRefillPlayerWater },
  { legacy: "set-skill-module", group: "player", subgroup: "items", name: "set-skill-module", access: "Owner", ...playersItemsSetSkillModule },
  { legacy: "set-skill-points", group: "player", subgroup: "items", name: "set-skill-points", access: "Owner", ...playersItemsSetSkillPoints },
  { legacy: "add-faction-reputation", group: "player", subgroup: "progression", name: "faction-reputation", access: "Owner", ...playersProgressionAddFactionReputation },
  { legacy: "add-player-currency", group: "player", subgroup: "progression", name: "add-currency", access: "Owner", ...playersProgressionAddPlayerCurrency },
  { legacy: "add-player-intel", group: "player", subgroup: "progression", name: "add-intel", access: "Owner", ...playersProgressionAddPlayerIntel },
  { legacy: "add-specialization-xp", group: "player", subgroup: "progression", name: "specialization-add-xp", access: "Owner", ...playersProgressionAddSpecializationXp },
  { legacy: "assign-player-faction", group: "player", subgroup: "progression", name: "assign-faction", access: "Owner", ...playersProgressionAssignPlayerFaction },
  { legacy: "complete-journey-node", group: "player", subgroup: "progression", name: "journey-complete", access: "Owner", ...playersProgressionCompleteJourneyNode },
  { legacy: "complete-tutorial", group: "player", subgroup: "progression", name: "tutorial-complete", access: "Owner", ...playersProgressionCompleteTutorial },
  { legacy: "grant-all-keystones", group: "player", subgroup: "progression", name: "keystones-grant-all", access: "Owner", ...playersProgressionGrantAllKeystones },
  { legacy: "max-specialization", group: "player", subgroup: "progression", name: "specialization-max", access: "Owner", ...playersProgressionMaxSpecialization },
  { legacy: "reset-all-keystones", group: "player", subgroup: "progression", name: "keystones-reset-all", access: "Owner", ...playersProgressionResetAllKeystones },
  { legacy: "reset-journey-node", group: "player", subgroup: "progression", name: "journey-reset", access: "Owner", ...playersProgressionResetJourneyNode },
  { legacy: "reset-specialization", group: "player", subgroup: "progression", name: "specialization-reset", access: "Owner", ...playersProgressionResetSpecialization },
  { legacy: "reset-tutorial", group: "player", subgroup: "progression", name: "tutorial-reset", access: "Owner", ...playersProgressionResetTutorial },
  { legacy: "unlock-crafting-recipe", group: "player", subgroup: "progression", name: "unlock-recipe", access: "Owner", ...playersProgressionUnlockCraftingRecipe },
  { legacy: "unlock-player-research", group: "player", subgroup: "progression", name: "unlock-research", access: "Owner", ...playersProgressionUnlockPlayerResearch },
  { legacy: "clean-player-inventory", group: "player", subgroup: "reset", name: "clean-inventory", access: "Owner", ...playersResetCleanPlayerInventory },
  { legacy: "reset-player-progression", group: "player", subgroup: "reset", name: "reset-progression", access: "Owner", ...playersResetResetPlayerProgression },
  { legacy: "backups", group: "backup", subgroup: null, name: "list", access: "Everyone", ...serverBackupsBackups },
  { legacy: "configure-auto-backup", group: "backup", subgroup: null, name: "configure-auto", access: "Owner", ...serverBackupsConfigureAutoBackup },
  { legacy: "create-backup", group: "backup", subgroup: null, name: "create", access: "Owner", ...serverBackupsCreateBackup },
  { legacy: "delete-all-backups", group: "backup", subgroup: null, name: "delete-all", access: "Owner", ...serverBackupsDeleteAllBackups },
  { legacy: "delete-backup", group: "backup", subgroup: null, name: "delete", access: "Owner", ...serverBackupsDeleteBackup },
  { legacy: "download-backup", group: "backup", subgroup: null, name: "download", access: "Owner", ...serverBackupsDownloadBackup },
  { legacy: "import-backup", group: "backup", subgroup: null, name: "import", access: "Owner", ...serverBackupsImportBackup },
  { legacy: "restore-backup", group: "backup", subgroup: null, name: "restore", access: "Owner", ...serverBackupsRestoreBackup },
  { legacy: "restart-server", group: "server", subgroup: null, name: "restart", access: "Owner", ...serverLifecycleRestartServer },
  { legacy: "start-server", group: "server", subgroup: null, name: "start", access: "Owner", ...serverLifecycleStartServer },
  { legacy: "stop-server", group: "server", subgroup: null, name: "stop", access: "Owner", ...serverLifecycleStopServer },
  { legacy: "cleanup-build-cache", group: "server", subgroup: null, name: "cleanup-build-cache", access: "Owner", ...serverMaintenanceCleanupBuildCache },
  { legacy: "cleanup-images", group: "server", subgroup: null, name: "cleanup-images", access: "Owner", ...serverMaintenanceCleanupImages },
  { legacy: "fix-network", group: "server", subgroup: null, name: "fix-network", access: "Owner", ...serverMaintenanceFixNetwork },
  { legacy: "servers", group: "server", subgroup: null, name: "vps", access: "Everyone", ...serverMonitoringServers },
  { legacy: "status", group: "server", subgroup: null, name: "status", access: "Everyone", ...serverMonitoringStatus },
  { legacy: "restart-service", group: "server", subgroup: null, name: "restart-service", access: "Owner", ...serverServicesRestartService },
  { legacy: "services", group: "server", subgroup: null, name: "services", access: "Owner", ...serverServicesServices },
  { legacy: "apply-game-update", group: "update", subgroup: "game", name: "apply", access: "Owner", ...updatesGameApplyGameUpdate },
  { legacy: "auto-update-status", group: "update", subgroup: "game", name: "auto-status", access: "Owner", ...updatesGameAutoUpdateStatus },
  { legacy: "check-game-update", group: "update", subgroup: "game", name: "check", access: "Owner", ...updatesGameCheckGameUpdate },
  { legacy: "configure-auto-update", group: "update", subgroup: "game", name: "configure-auto", access: "Owner", ...updatesGameConfigureAutoUpdate },
  { legacy: "fix-steamcmd", group: "update", subgroup: "runtime", name: "fix-steamcmd", access: "Owner", ...updatesRuntimeFixSteamcmd },
  { legacy: "repair-runtime", group: "update", subgroup: "runtime", name: "repair", access: "Owner", ...updatesRuntimeRepairRuntime },
  { legacy: "apply-stack-update", group: "update", subgroup: "stack", name: "apply", access: "Owner", ...updatesStackApplyStackUpdate },
  { legacy: "check-stack-update", group: "update", subgroup: "stack", name: "check", access: "Owner", ...updatesStackCheckStackUpdate },
] as const;
