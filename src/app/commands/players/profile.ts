import { ChatInputCommandInteraction, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorSpacingSize, SlashCommandBuilder } from "discord.js";

import { createLogger } from "../../../infrastructure/core/logger";
import { createV2Response } from "../../../shared/factories/componentFactory";
import { createDuneBanner } from "../../../shared/factories/imageFactory";
import { createActorContext } from "../../../shared/utils/createActorContext";

const logger = createLogger("PROFILE");

const IMAGE_NAME = "dune-profile.png";
const UNAVAILABLE = "Unavailable";
const ACCENT_COLOR = 0xc58b45;

const SHOW_SMUGGLER_FACTION = false;

interface PlayerData {
  linked?: boolean;
  message?: string;
  pawnId?: string | number | null;
  controllerId?: string | number | null;
  characterName?: string | null;
  onlineStatus?: string | null;
}

interface GuildRow {
  guild_id?: string | number;
  guildId?: string | number;
  id?: string | number;
  guild_name?: string;
  guildName?: string;
  name?: string;
  character_name?: string;
  characterName?: string;
}

interface GuildMemberRow {
  player_id?: string | number;
  playerId?: string | number;
  character_name?: string;
  characterName?: string;
  name?: string;
}

interface GuildMembershipResult {
  guildRow: GuildRow;
  membersResponse: unknown;
}

interface ProgressionData {
  level?: number | string;
  xp?: number | string;
  unspentSkillPoints?: number | string;
}

interface CurrencyRow {
  label?: string;
  balance?: number | string;
}

interface CurrencyData {
  rows?: CurrencyRow[];
}

interface SolarisCoinData {
  total?: number | string;
}

interface IntelData {
  intel?: number | string;
  maxIntel?: number | string;
}

interface VitalsData {
  currentHealth?: number | string;
  maxHealth?: number | string;
  hydration?: number | string;
  maxHydration?: number | string;
  spiceAddictionLevel?: number | string;
  maxSpiceAddictionLevel?: number | string;
}

interface FactionRow {
  faction_name?: string;
  reputation_amount?: number | string;
  estimated_rank?: number | string;
}

interface FactionsData {
  rows?: FactionRow[];
}

interface SpecsData {
  unspentPoints?: number | string;
  skillModules?: unknown[];
}

interface ProfileData {
  progression?: ProgressionData | null;
  currency?: CurrencyData | null;
  "solaris-coin"?: SolarisCoinData | null;
  intel?: IntelData | null;
  vitals?: VitalsData | null;
  factions?: FactionsData | null;
  specs?: SpecsData | null;
}

const getPlayerId = (player: PlayerData): string | number | null => {
  return player.pawnId ?? player.controllerId ?? null;
};

const getRows = <T>(response: unknown, keys: string[]): T[] => {
  if (!response || typeof response !== "object") {
    return [];
  }

  const data = response as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(data[key])) {
      return data[key] as T[];
    }
  }

  return [];
};

const getGuildRows = (response: unknown): GuildRow[] => getRows<GuildRow>(response, ["rows", "guilds", "data", "results"]);

const getGuildMemberRows = (response: unknown): GuildMemberRow[] => getRows<GuildMemberRow>(response, ["rows", "members", "data", "results"]);

const normalize = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const getGuildName = (guild: GuildRow | null): string => guild?.guild_name ?? guild?.guildName ?? guild?.name ?? "No guild";

const formatNumber = (value: unknown): string => {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round(number).toLocaleString() : UNAVAILABLE;
};

async function findGuild(response: unknown, player: PlayerData, guildMembers: GuildMembershipResult[]): Promise<GuildRow | null> {
  const rows = getGuildRows(response);

  const characterName = normalize(player.characterName);
  const controllerId = normalize(player.controllerId);

  const membership = guildMembers.find(({ membersResponse }) => {
    return getGuildMemberRows(membersResponse).some((member) => {
      const memberPlayerId = normalize(member.player_id ?? member.playerId);

      const memberCharacterName = normalize(member.character_name ?? member.characterName ?? member.name);

      return (controllerId && memberPlayerId === controllerId) || (characterName && memberCharacterName === characterName);
    });
  });

  return membership?.guildRow ?? rows.find((guild) => normalize(guild.character_name ?? guild.characterName) === characterName) ?? null;
}

async function loadGuildMemberships(interaction: ChatInputCommandInteraction, guildRows: GuildRow[]): Promise<GuildMembershipResult[]> {
  const results = await Promise.all(
    guildRows.map(async (guildRow) => {
      const guildId = guildRow.guild_id ?? guildRow.guildId ?? guildRow.id;

      if (!guildId) {
        logger.warn("Guild row did not contain a valid guild ID:", JSON.stringify(guildRow));
        return null;
      }

      try {
        const membersResponse = await interaction.client.duneApi.call("GET", "/api/guilds/{guildId}/members", {
          routeParams: {
            guildId,
          },
        });

        logger.debug(`Profile guild members response (${guildId}):`, JSON.stringify(membersResponse, null, 2));

        return {
          guildRow,
          membersResponse,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        logger.warn(`Unable to load members for guild ${guildId}: ${message}`);

        return null;
      }
    }),
  );

  return results.filter((result): result is GuildMembershipResult => result !== null);
}

async function loadProfileData(interaction: ChatInputCommandInteraction, playerId: string | number): Promise<ProfileData> {
  const endpoints = ["currency", "solaris-coin", "factions", "intel", "specs", "progression", "vitals"] as const;

  const responses = await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const response = await interaction.client.duneApi.call("GET", `/api/players/{playerId}/${endpoint}`, {
          routeParams: {
            playerId,
          },
        });

        logger.debug(`Profile response ${endpoint}:`, JSON.stringify(response, null, 2));

        return [endpoint, response] as const;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        logger.warn(`Profile endpoint ${endpoint} unavailable: ${message}`);

        return [endpoint, null] as const;
      }
    }),
  );

  return Object.fromEntries(responses) as ProfileData;
}

const formatCurrency = (currency: CurrencyData | null | undefined, coin: SolarisCoinData | null | undefined): string => {
  const currencies = currency?.rows?.map((row) => `${row.label ?? "Currency"}: **${formatNumber(row.balance)}**`).join(" · ") || UNAVAILABLE;

  return `${currencies} · Solaris Coin: **${formatNumber(coin?.total)}**`;
};

const formatProgression = (value: ProgressionData | null | undefined): string => {
  if (!value) {
    return UNAVAILABLE;
  }

  return [`Level **${formatNumber(value.level)}**`, `XP **${formatNumber(value.xp)}**`, `Unspent skill points **${formatNumber(value.unspentSkillPoints)}**`].join(" · ");
};

const formatIntel = (value: IntelData | null | undefined): string => {
  if (!value) {
    return UNAVAILABLE;
  }

  return `**${formatNumber(value.intel)}** / ${formatNumber(value.maxIntel)}`;
};

const formatVitals = (value: VitalsData | null | undefined): string => {
  if (!value) {
    return UNAVAILABLE;
  }

  return [
    `Health **${formatNumber(value.currentHealth)} / ${formatNumber(value.maxHealth)}**`,
    `Hydration **${formatNumber(value.hydration)} / ${formatNumber(value.maxHydration)}**`,
    `Spice addiction **${formatNumber(value.spiceAddictionLevel)} / ${formatNumber(value.maxSpiceAddictionLevel)}**`,
  ].join(" · ");
};

const formatFactions = (value: FactionsData | null | undefined): string => {
  if (!value?.rows) {
    return UNAVAILABLE;
  }

  const factions = value.rows
    .filter((row) => SHOW_SMUGGLER_FACTION || normalize(row.faction_name) !== "smuggler")
    .map((row) => `${row.faction_name ?? "Faction"}: **${formatNumber(row.reputation_amount)}** (rank ${formatNumber(row.estimated_rank)})`)
    .join("\n");

  return factions || UNAVAILABLE;
};

const formatSpecs = (value: SpecsData | null | undefined): string => {
  if (!value) {
    return UNAVAILABLE;
  }

  return [`Unspent points: **${formatNumber(value.unspentPoints)}**`, `Skill modules: **${value.skillModules?.length ?? 0}**`].join(" · ");
};

const formatProfile = (player: PlayerData, data: ProfileData, guild: GuildRow | null): string => {
  return [
    `### ${player.characterName ?? "Unknown"}`,
    `**Status:** ${player.onlineStatus ?? "Unknown"}`,
    `**Guild:** ${getGuildName(guild)}`,
    "",
    `### Progression\n${formatProgression(data.progression)}`,
    `### Currency\n${formatCurrency(data.currency, data["solaris-coin"])}`,
    `### Intel\n${formatIntel(data.intel)}`,
    `### Vitals\n${formatVitals(data.vitals)}`,
    `### Factions\n${formatFactions(data.factions)}`,
    `### Specializations\n${formatSpecs(data.specs)}`,
  ].join("\n");
};

module.exports = {
  data: new SlashCommandBuilder().setName("profile").setDescription("Show your linked Dune player profile."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const { client } = interaction;

    if (!client.discordAdapter) {
      await interaction.editReply({
        content: "The Discord Adapter integration is not configured.",
      });
      return;
    }

    const player = (await client.discordAdapter.getCurrentPlayer(createActorContext(interaction, "/profile"))) as PlayerData | null;

    if (player?.linked !== true) {
      await interaction.editReply({
        content: player?.message ?? "You do not have a linked Dune character yet.",
      });
      return;
    }

    const playerId = getPlayerId(player);

    if (!playerId) {
      await interaction.editReply({
        content: "Your linked Dune character does not have a valid player ID.",
      });
      return;
    }

    logger.debug(`Profile player ID: ${playerId}`);

    try {
      const guildResponse = await client.duneApi.call("GET", "/api/guilds", {
        query: {
          page: 0,
          pageSize: 100,
        },
      });

      logger.debug("Profile guild response:", JSON.stringify(guildResponse, null, 2));

      const guildRows = getGuildRows(guildResponse);
      const guildMembers = await loadGuildMemberships(interaction, guildRows);

      const guild = await findGuild(guildResponse, player, guildMembers);

      const data = await loadProfileData(interaction, playerId);

      const card = new ContainerBuilder()
        .setAccentColor(ACCENT_COLOR)
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${IMAGE_NAME}`).setDescription("Dune character profile")))
        .addTextDisplayComponents((text) => text.setContent("## Your Dune Player"))
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((text) => text.setContent(formatProfile(player, data, guild)));

      const banner = createDuneBanner({
        filename: IMAGE_NAME,
        title: "Dune Profile",
        subtitle: player.characterName ?? "Unknown",
        detail: "CHARACTER DATA • ARRAKIS",
      });

      await interaction.editReply(createV2Response([card], [banner]));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(`Unable to load Dune profile: ${message}`, error);

      await interaction.editReply({
        content: "Unable to retrieve your Dune profile right now. Please try again later.",
      });
    }
  },
};
