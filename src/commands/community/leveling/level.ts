import { Command } from "@sapphire/framework";
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type AttachmentBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { LevelProfile } from "../../../infrastructure/database/leveling/LevelRepository";
import { LEVEL_LEADERBOARD_FILENAME, createLevelLeaderboardCard, type LevelLeaderboardEntry } from "../../../modules/community/leveling/leaderboardCard";
import { LEVEL_CARD_FILENAME, createLevelRankCard } from "../../../modules/community/leveling/levelCard";
import { levelForXp } from "../../../modules/community/leveling/levelProgress";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("View community levels and message activity.")
  .addSubcommand((command) =>
    command
      .setName("rank")
      .setDescription("View your community level or another member's level.")
      .addUserOption((option) => option.setName("member").setDescription("Member whose level you want to view.")),
  )
  .addSubcommand((command) => command.setName("leaderboard").setDescription("View the server's top community levels."))
  .addSubcommandGroup((group) => group
    .setName("event")
    .setDescription("Configure server double-XP events.")
    .addSubcommand((command) => command
      .setName("schedule")
      .setDescription("Schedule a double-XP window now or at an ISO date and time.")
      .addIntegerOption((option) => option.setName("duration-minutes").setDescription("Event length from 15 minutes to 7 days.").setMinValue(15).setMaxValue(10_080).setRequired(true))
      .addStringOption((option) => option.setName("starts-at").setDescription("Optional ISO date/time; omit to start now.").setMaxLength(40)))
    .addSubcommand((command) => command.setName("status").setDescription("Show the scheduled or active double-XP event."))
    .addSubcommand((command) => command.setName("stop").setDescription("Cancel the scheduled or active double-XP event.")))
  .addSubcommandGroup((group) => group
    .setName("roles")
    .setDescription("Inspect the configured community level roles.")
    .addSubcommand((command) => command.setName("status").setDescription("Show every configured level role and its required level.")));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const action = interaction.options.getSubcommand(true);
  // Dev note: Admin controls whisper; rank cards deserve the public parade route.
  if (group) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  else await interaction.deferReply();

  if (!interaction.guildId || !interaction.client.leveling) {
    await interaction.editReply({ content: "Community leveling is not available here. Configure PostgreSQL and restart the bot.", allowedMentions: { parse: [] } });
    return;
  }

  try {
    if (group) {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.editReply("Manage Server permission is required to configure level events and roles.");
        return;
      }
      const view = group === "event" ? await buildEventAdmin(interaction, action) : buildRoleAdmin(interaction);
      await interaction.editReply({ content: null, components: [view], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
      return;
    }

    const view = action === "leaderboard"
      ? await buildLeaderboard(interaction)
      : await buildRank(interaction);

    await interaction.editReply({ content: null, components: [view.card], files: view.files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    await interaction.editReply({ content: error instanceof Error ? error.message : "The leveling request could not be completed.", components: [], allowedMentions: { parse: [] } });
  }
}

interface LevelView {
  card: ContainerBuilder;
  files: AttachmentBuilder[];
}

async function buildRank(interaction: ChatInputCommandInteraction): Promise<LevelView> {
  const user = interaction.options.getUser("member") ?? interaction.user;
  const profile = await interaction.client.leveling!.profile(interaction.guildId!, user.id);
  const member = await interaction.guild?.members.fetch(user.id).catch(() => null) ?? null;
  const multiplier = member ? await interaction.client.leveling!.multiplier(member) : 1;
  const displayName = member?.displayName ?? user.globalName ?? user.username;
  const image = await createLevelRankCard({ user, displayName, profile, multiplier });

  const card = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${LEVEL_CARD_FILENAME}`)
        .setDescription(levelCardDescription(displayName, profile, multiplier)),
    ));

  return { card, files: [image] };
}

async function buildLeaderboard(interaction: ChatInputCommandInteraction): Promise<LevelView> {
  const profiles = await interaction.client.leveling!.leaderboard(interaction.guildId!);
  const entries = await Promise.all(profiles.map((profile) => resolveLeaderboardEntry(interaction, profile)));
  const image = await createLevelLeaderboardCard(entries);
  const card = new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${LEVEL_LEADERBOARD_FILENAME}`)
        .setDescription(leaderboardDescription(entries)),
    ));

  return { card, files: [image] };
}

async function buildEventAdmin(interaction: ChatInputCommandInteraction, action: string): Promise<ContainerBuilder> {
  const service = interaction.client.leveling!;
  let event;
  let summary: string;
  if (action === "schedule") {
    const startsAt = parseEventStart(interaction.options.getString("starts-at"));
    event = await service.scheduleEvent(interaction.guildId!, startsAt, interaction.options.getInteger("duration-minutes", true), interaction.user.id);
    summary = `Double XP is scheduled from <t:${Math.floor(event.startsAt.getTime() / 1_000)}:F> until <t:${Math.floor(event.endsAt.getTime() / 1_000)}:F>.`;
  } else if (action === "stop") {
    summary = await service.stopEvent(interaction.guildId!) ? "The double-XP event was cancelled." : "There was no scheduled or active double-XP event.";
  } else {
    event = await service.eventStatus(interaction.guildId!);
    summary = event
      ? `Double XP ${event.startsAt.getTime() <= Date.now() ? "is active" : "is scheduled"} from <t:${Math.floor(event.startsAt.getTime() / 1_000)}:F> until <t:${Math.floor(event.endsAt.getTime() / 1_000)}:F>.`
      : "No double-XP event is scheduled.";
  }

  return new ContainerBuilder()
    .setAccentColor(0xe7ad55)
    .addTextDisplayComponents((text) => text.setContent("## ✨ Community XP Event"))
    .addTextDisplayComponents((text) => text.setContent(summary))
    .addTextDisplayComponents((text) => text.setContent("-# Event XP stacks with the permanent booster bonus: 2× event + 2× booster = 4× total XP."));
}

function buildRoleAdmin(interaction: ChatInputCommandInteraction): ContainerBuilder {
  const service = interaction.client.leveling!;
  const rows = service.roleStatus(interaction.guild!).map((role) =>
    `${!role.configured ? "❌" : !role.present ? "🔎" : role.manageable ? "✅" : "⚠️"} **Level ${role.level}** — ${role.name}`,
  );

  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addTextDisplayComponents((text) => text.setContent("## 🎖️ Community Level Roles"))
    .addTextDisplayComponents((text) => text.setContent(rows.join("\n")))
    .addTextDisplayComponents((text) => text.setContent("-# Configure every role ID in .env, restart the bot, and keep the roles below the bot's highest role. ✅ ready · ⚠️ too high · 🔎 ID not found · ❌ not configured"));
}

function parseEventStart(value: string | null): Date {
  if (!value?.trim()) return new Date();
  // Dev note: Prescience accepts ISO timestamps, but refuses appointments thirty-one days into the future.
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) throw new Error("starts-at must be a valid ISO date and time, such as 2026-09-21T18:00:00-04:00.");
  if (date.getTime() < Date.now() - 60_000) throw new Error("starts-at cannot be in the past.");
  if (date.getTime() > Date.now() + 30 * 24 * 60 * 60_000) throw new Error("starts-at must be within the next 30 days.");
  return date;
}

async function resolveLeaderboardEntry(interaction: ChatInputCommandInteraction, profile: LevelProfile): Promise<LevelLeaderboardEntry> {
  const cachedMember = interaction.guild?.members.cache.get(profile.userId);
  const member = cachedMember ?? await interaction.guild?.members.fetch(profile.userId).catch(() => null) ?? null;
  const cachedUser = interaction.client.users.cache.get(profile.userId);
  const user = member?.user ?? cachedUser ?? await interaction.client.users.fetch(profile.userId).catch(() => null);
  return {
    profile,
    user,
    displayName: member?.displayName ?? user?.globalName ?? user?.username ?? "Unknown Traveler",
  };
}

function leaderboardDescription(entries: readonly LevelLeaderboardEntry[]): string {
  if (!entries.length) return "Arrakis community leaderboard with no ranked travelers yet.";
  const rows = entries.map((entry) => {
    const name = entry.displayName.replace(/[\r\n]/g, " ").trim().slice(0, 40) || "Unknown Traveler";
    return `rank ${entry.profile.rank ?? "unranked"}: ${name}, level ${levelForXp(entry.profile.xp)}, ${entry.profile.xp.toLocaleString()} XP`;
  });
  return `Arrakis community leaderboard. ${rows.join("; ")}.`.slice(0, 1_000);
}

function levelCardDescription(displayName: string, profile: LevelProfile, multiplier: number): string {
  const rank = profile.rank ? `server rank ${profile.rank}` : "unranked";
  return `${displayName}'s Arrakis community card: level ${levelForXp(profile.xp)}, ${rank}, ${profile.xp.toLocaleString()} total XP, ${profile.messageCount.toLocaleString()} XP-earning messages, ${profile.voiceMinutes.toLocaleString()} rewarded voice minutes, and a ${multiplier} times XP multiplier.`;
}

class LevelCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "level", description: "View community levels and message activity.", preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }
}

export { LevelCommand, data, execute };
