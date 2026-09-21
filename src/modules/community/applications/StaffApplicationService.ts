import { randomUUID } from "node:crypto";
import { ButtonBuilder, ButtonStyle, ContainerBuilder, PermissionFlagsBits, SeparatorSpacingSize, escapeMarkdown, type ButtonInteraction, type Client, type ModalSubmitInteraction } from "discord.js";
import type { StaffApplicationConfig } from "../../../infrastructure/config/staffApplications";
import { StaffApplicationRepository, type StaffApplicationAnswers, type StaffApplicationRecord, type StaffApplicationStatus } from "../../../infrastructure/database/applications/StaffApplicationRepository";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import { getConfiguredStaffRoleIds } from "../../../support/access/staffAccess";
import { createV2Response } from "../../../shared/discord/componentFactory";

class StaffApplicationService {
  public constructor(public readonly client: Client, public readonly repository: StaffApplicationRepository, public readonly config: StaffApplicationConfig) {}

  public initialize(): Promise<void> {
    return this.repository.initialize();
  }

  public canReview(interaction: ButtonInteraction | ModalSubmitInteraction): boolean {
    if (!interaction.guild) return false;
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const roleIds = [...getConfiguredStaffRoleIds(), this.config.reviewerRoleId].filter((id): id is string => Boolean(id));
    return interaction.guild.ownerId === interaction.user.id || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true || roleIds.some((id) => member?.roles.cache.has(id));
  }

  public async submit(interaction: ModalSubmitInteraction, answers: StaffApplicationAnswers): Promise<string> {
    if (!interaction.guild) return "Applications can only be submitted inside the server.";
    const latest = await this.repository.latest(interaction.guild.id, interaction.user.id);
    const blocked = applicationBlockReason(latest, this.config.cooldownDays);
    if (blocked) return blocked;

    // Dev note: The spice may flow freely; duplicate job applications do not.
    const id = randomUUID();
    const record = await this.repository.create(id, interaction.guild.id, interaction.user.id, answers);
    if (!record) return "You already have an application pending review.";

    let pendingRoleAdded = false;
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (this.config.pendingRoleId) {
        await member.roles.add(this.config.pendingRoleId, "Staff application submitted");
        pendingRoleAdded = true;
      }
      const channel = await this.client.channels.fetch(this.config.reviewChannelId);
      if (!channel || !channel.isSendable()) throw new Error(`Review channel ${this.config.reviewChannelId} is not sendable.`);
      const message = await channel.send({ ...createV2Response([buildReviewCard(record, interaction.user.tag)]), allowedMentions: { parse: [] } });
      await this.repository.attachReview(id, message.channelId, message.id);
      await this.client.auditLogger.send("Staff application submitted", [`**Applicant:** ${safe(interaction.user.tag)} (${interaction.user.id})`, `**Application:** ${id}`, `**Review channel:** <#${message.channelId}>`]);
      return "Your staff application has been sent to the leadership team. You will receive the decision privately.";
    } catch (error) {
      await this.repository.removePending(id);
      if (pendingRoleAdded && this.config.pendingRoleId) {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        await member?.roles.remove(this.config.pendingRoleId, "Staff application submission rolled back").catch(() => undefined);
      }
      throw error;
    }
  }

  public async review(interaction: ModalSubmitInteraction, id: string, decision: Exclude<StaffApplicationStatus, "pending">, reason: string): Promise<string> {
    if (!interaction.guild) return "This application is no longer available.";
    const record = await this.repository.decide(id, decision, interaction.user.id, reason);
    if (!record) return "This application was already reviewed or no longer exists.";

    const member = await interaction.guild.members.fetch(record.userId).catch(() => null);
    // Dev note: Promotions are paperwork with better hats and stricter hierarchy checks.
    const roleWarnings: string[] = [];
    if (member && this.config.pendingRoleId) await member.roles.remove(this.config.pendingRoleId, "Staff application reviewed").catch(() => roleWarnings.push("pending role could not be removed"));
    if (member && decision === "accepted" && this.config.acceptedRoleId) await member.roles.add(this.config.acceptedRoleId, "Staff application accepted").catch(() => roleWarnings.push("accepted role could not be added"));

    await this.updateReviewMessage(record, interaction.user.tag);
    const applicant = await this.client.users.fetch(record.userId).catch(() => null);
    const decisionText = decision === "accepted" ? "accepted" : "not accepted";
    await applicant?.send({ content: `Your Crimson Skies staff application was **${decisionText}**.${reason ? `\n\n**Staff note:** ${reason}` : ""}`, allowedMentions: { parse: [] } }).catch(() => undefined);
    await this.client.auditLogger.send("Staff application reviewed", [`**Applicant:** <@${record.userId}>`, `**Reviewer:** ${safe(interaction.user.tag)} (${interaction.user.id})`, `**Decision:** ${decision}`, `**Reason:** ${safe(reason || "No reason provided")}`, ...(roleWarnings.length ? [`**Role warning:** ${roleWarnings.join(", ")}`] : [])]);
    return `Application ${decision}.${roleWarnings.length ? ` Warning: ${roleWarnings.join("; ")}.` : ""}`;
  }

  private async updateReviewMessage(record: StaffApplicationRecord, reviewerTag: string): Promise<void> {
    if (!record.reviewChannelId || !record.reviewMessageId) return;
    const channel = await this.client.channels.fetch(record.reviewChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(record.reviewMessageId).catch(() => null);
    if (!message) return;
    await message.edit({ ...createV2Response([buildReviewCard(record, undefined, reviewerTag)]), attachments: [], allowedMentions: { parse: [] } });
  }
}

function applicationBlockReason(latest: StaffApplicationRecord | null, cooldownDays: number, now = Date.now()): string | null {
  if (!latest) return null;
  if (latest.status === "pending") return "You already have an application pending review.";
  if (cooldownDays === 0) return null;
  const eligibleAt = latest.createdAt.getTime() + cooldownDays * 86_400_000;
  return eligibleAt > now ? `You can apply again <t:${Math.ceil(eligibleAt / 1000)}:R>.` : null;
}

function buildReviewCard(record: StaffApplicationRecord, applicantTag?: string, reviewerTag?: string): ContainerBuilder {
  const card = new ContainerBuilder()
    .setAccentColor(record.status === "accepted" ? 0x5d9b62 : record.status === "denied" ? 0xa6493f : 0xc58b45)
    .addTextDisplayComponents((text) => text.setContent(`## Staff application · ${record.status.toUpperCase()}`))
    .addTextDisplayComponents((text) => text.setContent(`**Applicant:** ${applicantTag ? safe(applicantTag) : `<@${record.userId}>`} (${record.userId})\n**Submitted:** <t:${Math.floor(record.createdAt.getTime() / 1000)}:F>\n**Application ID:** \`${record.id}\``))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
  const sections: Array<[string, string]> = [["About", record.answers.identity], ["Experience", record.answers.experience], ["Motivation", record.answers.motivation], ["Scenario response", record.answers.scenario], ["Availability", record.answers.availability]];
  for (const [title, value] of sections) card.addTextDisplayComponents((text) => text.setContent(truncateDiscordText(`### ${title}\n${safe(value)}`, 760)));
  if (record.status === "pending") {
    card.addActionRowComponents((row) => row.setComponents(
      new ButtonBuilder().setCustomId(`staff-application:accept:${record.id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`staff-application:deny:${record.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
    ));
  } else {
    card.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    card.addTextDisplayComponents((text) => text.setContent(`**Reviewed by:** ${reviewerTag ? safe(reviewerTag) : `<@${record.reviewerId}>`}\n**Reason:** ${safe(record.reviewReason || "No reason provided")}`));
  }
  return card;
}

function safe(value: string): string {
  return escapeMarkdown(value).replace(/@/g, "@\u200b");
}

export { StaffApplicationService, applicationBlockReason, buildReviewCard };
