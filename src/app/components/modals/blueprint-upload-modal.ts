import { MessageFlags, ModalSubmitInteraction } from "discord.js";

import { BLUEPRINT_LIMITS } from "../../../infrastructure/config/limits.js";
import { createActorContext } from "../../../shared/utils/createActorContext.js";

const MINIMUM_OFFLINE_MS = BLUEPRINT_LIMITS.minimumOfflineMs;

interface LinkedPlayer {
  linked?: boolean;
  pawnId?: string | number | null;
  characterName?: string | null;
  controllerId?: string | number | null;
  onlineStatus?: string | boolean | null;

  lastLogoutTime?: string | number | Date | null;
  last_logout_time?: string | number | Date | null;
  lastOfflineTime?: string | number | Date | null;
  last_offline_time?: string | number | Date | null;
}

interface PlayerProfile {
  status?: string | boolean | null;
  onlineStatus?: string | boolean | null;
  online_status?: string | boolean | null;

  player?: {
    status?: string | boolean | null;
    onlineStatus?: string | boolean | null;
    lastLogoutTime?: string | number | Date | null;
    last_logout_time?: string | number | Date | null;
  } | null;

  player_controller_id?: string | number | null;
  playerControllerId?: string | number | null;

  character_name?: string | null;
  characterName?: string | null;

  lastLogoutTime?: string | number | Date | null;
  last_logout_time?: string | number | Date | null;
  lastOfflineTime?: string | number | Date | null;
  last_offline_time?: string | number | Date | null;

  last_seen?: string | number | Date | null;
  lastSeen?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
  updated_at?: string | number | Date | null;
}

interface PlayerListResponse {
  rows?: PlayerProfile[];
  players?: PlayerProfile[];
  data?: PlayerProfile[];
  results?: PlayerProfile[];
  items?: PlayerProfile[];
}

module.exports = {
  customId: "blueprint-upload-modal",

  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const { discordAdapter, duneApi, auditLogger } = interaction.client;

    if (!discordAdapter) {
      throw new Error("Discord Adapter integration is not configured.");
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const actor = createActorContext(interaction, "blueprint-upload");
    const linked = (await discordAdapter.getCurrentPlayer(actor)) as LinkedPlayer | null;

    if (!linked?.linked) {
      await interaction.editReply("You must link a Dune character before uploading a blueprint.");
      return;
    }

    const playerId = linked.pawnId;

    if (!playerId) {
      throw new Error("The linked character did not provide a player pawn ID.");
    }

    const playerList = (await duneApi.call("GET", "/api/players", {
      query: {
        q: linked.characterName ?? "",
        status: "all",
        page: 0,
        pageSize: 50,
      },
    })) as PlayerListResponse | PlayerProfile[];

    const profile = findLinkedPlayer(playerList, linked);

    if (!profile) {
      await interaction.editReply("Unable to find your linked character in the Dune Console. " + "Please unlink and link your account again.");
      return;
    }

    if (isOnline(linked, profile)) {
      await interaction.editReply("Your linked character must be offline for at least one minute " + "before uploading a blueprint.");
      return;
    }

    const offlineAt = getOfflineTimestamp(linked, profile);

    if (!offlineAt) {
      await interaction.editReply("Unable to confirm when your character went offline. " + "Please wait and try again.");
      return;
    }

    const elapsed = Date.now() - offlineAt.getTime();

    if (elapsed < MINIMUM_OFFLINE_MS) {
      const remainingSeconds = Math.ceil((MINIMUM_OFFLINE_MS - elapsed) / 1000);

      await interaction.editReply(`Your character must remain offline for ${remainingSeconds} more ` + `second${remainingSeconds === 1 ? "" : "s"} before uploading a blueprint.`);
      return;
    }

    const files = interaction.fields.getUploadedFiles("blueprint-file", true);

    if (files.size !== 1) {
      await interaction.editReply("Upload exactly one blueprint JSON file at a time.");
      return;
    }

    const file = files.first();

    if (!file) {
      await interaction.editReply("Unable to read the uploaded blueprint file.");
      return;
    }

    const result = await duneApi.importBlueprint(String(playerId), file);

    await interaction.editReply(result.message ?? `Blueprint imported for ${linked.characterName ?? "your linked character"}.`);

    await auditLogger?.blueprintImported(interaction, linked, result, file);
  },
};

function isOnline(linked: LinkedPlayer, profile: PlayerProfile): boolean {
  if (String(linked.onlineStatus).toLowerCase() === "online") {
    return true;
  }

  const status = profile.status ?? profile.onlineStatus ?? profile.online_status ?? profile.player?.status ?? profile.player?.onlineStatus;

  return status === true || String(status).toLowerCase() === "online";
}

function findLinkedPlayer(response: PlayerListResponse | PlayerProfile[] | null | undefined, linked: LinkedPlayer): PlayerProfile | null {
  const rows = getPlayerRows(response);

  if (rows.length === 0) {
    return null;
  }

  const linkedName = String(linked.characterName ?? "")
    .trim()
    .toLowerCase();

  const controllerId = String(linked.controllerId ?? "");

  return (
    rows.find((player) => String(player.player_controller_id ?? player.playerControllerId ?? "") === controllerId) ??
    rows.find(
      (player) =>
        String(player.character_name ?? player.characterName ?? "")
          .trim()
          .toLowerCase() === linkedName,
    ) ??
    null
  );
}

function getPlayerRows(response: PlayerListResponse | PlayerProfile[] | null | undefined): PlayerProfile[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (!response) {
    return [];
  }

  return response.rows ?? response.players ?? response.data ?? response.results ?? response.items ?? [];
}

function getOfflineTimestamp(linked: LinkedPlayer, profile: PlayerProfile): Date | null {
  const values: Array<string | number | Date | null | undefined> = [
    linked.lastLogoutTime,
    linked.last_logout_time,
    linked.lastOfflineTime,
    linked.last_offline_time,

    profile.lastLogoutTime,
    profile.last_logout_time,
    profile.lastOfflineTime,
    profile.last_offline_time,

    profile.player?.lastLogoutTime,
    profile.player?.last_logout_time,

    profile.last_seen,
    profile.lastSeen,
    profile.updatedAt,
    profile.updated_at,
  ];

  const value = values.find(Boolean);

  if (!value) {
    return null;
  }

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}
