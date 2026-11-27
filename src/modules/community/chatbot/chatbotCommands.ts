import { MessageFlags, escapeMarkdown, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import type { AccessSubject, ChatbotService } from "./ChatbotService";

const UNAVAILABLE = "The chatbot is turned off on this server.";
const STAFF_ONLY = "Only staff can change what the chatbot knows.";

function subjectOf(interaction: ChatInputCommandInteraction | AutocompleteInteraction): AccessSubject {
  return { userId: interaction.user.id, guildOwnerId: interaction.guild?.ownerId ?? null, member: interaction.member, permissions: interaction.memberPermissions };
}

async function executeChatCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const service = interaction.client.chatbot;
  if (!service || !interaction.guildId) {
    await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.options.getSubcommand(true);
  if (action === "ask") return ask(interaction, service, interaction.guildId);
  // Authorization is checked here at execution time, never from Discord's command visibility.
  if (!service.isStaff(subjectOf(interaction))) {
    await interaction.reply({ content: STAFF_ONLY, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!service.canLearn) {
    await interaction.reply({ content: "Teaching the chatbot needs the PostgreSQL database (`DATABASE_URL`).", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (action === "teach") await teach(interaction, service, interaction.guildId);
    else if (action === "forget") await forget(interaction, service, interaction.guildId);
    else await list(interaction, service, interaction.guildId);
  } catch (error: unknown) {
    await interaction.editReply({ content: error instanceof RangeError ? error.message : "Something went wrong saving that. Try again in a minute." });
    if (!(error instanceof RangeError)) throw error;
  }
}

async function ask(interaction: ChatInputCommandInteraction, service: ChatbotService, guildId: string): Promise<void> {
  const subject = subjectOf(interaction);
  if (!service.canUse(subject)) {
    await interaction.reply({ content: "The chatbot is only open to staff on this server right now.", flags: MessageFlags.Ephemeral });
    return;
  }
  const wait = service.takeCooldown(interaction.user.id);
  if (wait > 0) {
    await interaction.reply({ content: `Give me ${wait}s to catch my breath, then ask again.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const question = interaction.options.getString("message", true);
  const privately = interaction.options.getBoolean("private") === true;
  await interaction.deferReply(privately ? { flags: MessageFlags.Ephemeral } : {});
  const answer = await service.answer({
    guildId,
    channelId: interaction.channelId,
    text: question,
    seed: interaction.id,
    userId: interaction.user.id,
    displayName: interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.displayName,
    serverName: interaction.guild?.name ?? "this server",
    isStaff: service.isStaff(subject),
  });
  const quoted = `> ${escapeMarkdown(question.replace(/\s+/g, " ")).slice(0, 200)}\n`;
  await interaction.editReply({ content: truncateDiscordText(`${quoted}${answer}`, 2_000), allowedMentions: { parse: [] } });
}

async function teach(interaction: ChatInputCommandInteraction, service: ChatbotService, guildId: string): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  const answer = interaction.options.getString("answer", true).replace(/\\n/g, "\n").trim();
  const taught = await service.teach(guildId, question, answer, interaction.user.id);
  await interaction.editReply({
    content: `Learned answer **#${taught.id}**. When someone asks something like "${escapeMarkdown(question)}", I'll say:\n${truncateDiscordText(answer, 1_500)}`,
    allowedMentions: { parse: [] },
  });
}

async function forget(interaction: ChatInputCommandInteraction, service: ChatbotService, guildId: string): Promise<void> {
  const id = interaction.options.getString("answer", true).replace(/^#/, "").trim();
  if (!/^\d{1,18}$/.test(id)) {
    await interaction.editReply({ content: "Pick an answer from the list, or give its number such as `12`." });
    return;
  }
  const removed = await service.forget(guildId, id);
  await interaction.editReply({ content: removed ? `Forgot answer **#${removed.id}** ("${escapeMarkdown(removed.question)}").` : `There's no taught answer #${id}.`, allowedMentions: { parse: [] } });
}

async function list(interaction: ChatInputCommandInteraction, service: ChatbotService, guildId: string): Promise<void> {
  const answers = await service.taught(guildId);
  if (answers.length === 0) {
    await interaction.editReply({ content: "I haven't been taught anything yet. Use `/chat teach` to add an answer." });
    return;
  }
  const lines = answers.map((entry) => `**#${entry.id}** ${escapeMarkdown(entry.question.slice(0, 80))} · used ${entry.uses}×`);
  let content = `**Taught answers (${answers.length})**\n`;
  for (const [index, line] of lines.entries()) {
    if (content.length + line.length + 60 > 2_000) {
      content += `-# and ${lines.length - index} more`;
      break;
    }
    content += `${line}\n`;
  }
  await interaction.editReply({ content, allowedMentions: { parse: [] } });
}

/** Suggests taught answers for `/chat forget`, staff only. */
async function autocompleteTaughtAnswer(interaction: AutocompleteInteraction): Promise<void> {
  const service = interaction.client.chatbot;
  if (!service || !interaction.guildId || !service.isStaff(subjectOf(interaction))) {
    await interaction.respond([]);
    return;
  }
  const query = interaction.options.getFocused().toLowerCase();
  const answers = await service.taught(interaction.guildId).catch(() => []);
  await interaction.respond(answers
    .filter((entry) => !query || entry.question.toLowerCase().includes(query) || entry.id === query.replace(/^#/, ""))
    .slice(0, 25)
    .map((entry) => ({ name: `#${entry.id} ${entry.question}`.slice(0, 100), value: entry.id })));
}

export { autocompleteTaughtAnswer, executeChatCommand };
