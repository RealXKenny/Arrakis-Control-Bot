import { container } from "@sapphire/framework";
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

import { scopedLogger } from "../../../client/logger";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { truncateDiscordText } from "../../../shared/discord/discordLimits";
import { parseServices } from "../monitoring/status";

interface ServiceRow {
  name: string;
  status: string;
}

const data = new SlashCommandBuilder().setName("services").setDescription("List Dune server services and their status.");

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeServiceRows(value: unknown): ServiceRow[] {
  if (isRecord(value) && typeof value.stdout === "string") {
    return parseServices(value.stdout).services;
  }

  const candidates = Array.isArray(value) ? value : isRecord(value) ? [value.services, value.rows, value.data].find(Array.isArray) : null;

  if (!Array.isArray(candidates)) return [];

  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];

    const name = candidate.name ?? candidate.service ?? candidate.container;
    const status = candidate.status ?? candidate.state;

    return typeof name === "string" && typeof status === "string" ? [{ name, status }] : [];
  });
}

function serviceIndicator(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("healthy") || normalized.startsWith("up") || normalized.includes("running")) return "🟢";
  if (normalized.includes("starting") || normalized.includes("restarting")) return "🟡";
  return "🔴";
}

function createServicesCard(rows: ServiceRow[]): ContainerBuilder {
  const body = rows.length ? rows.map((row) => `${serviceIndicator(row.status)} \`${row.name}\` — ${row.status}`).join("\n") : "No service status data was reported.";

  return new ContainerBuilder()
    .setAccentColor(0xc58b45)
    .addTextDisplayComponents((text) => text.setContent("## ⚙️ Dune Server Services"))
    .addTextDisplayComponents((text) => text.setContent(`-# ${rows.length} service${rows.length === 1 ? "" : "s"} reported`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(truncateDiscordText(body, 3_200)))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("-# Use `/restart-service service:<name>` to restart one service."));
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const response = await container.client.duneApi.call("GET", "/api/server/services");
    const rows = normalizeServiceRows(response);

    await interaction.editReply({ ...createV2Response([createServicesCard(rows)]), allowedMentions: { parse: [] } });
  } catch (error: unknown) {
    scopedLogger(container.logger, "SERVER").error("Unable to retrieve Dune server services.", error);
    await interaction.editReply({
      ...createV2Response([
        new ContainerBuilder()
          .setAccentColor(0x8f3025)
          .addTextDisplayComponents((text) => text.setContent("## ❌ Services unavailable"))
          .addTextDisplayComponents((text) => text.setContent("The Dune server service list could not be retrieved.")),
      ]),
      allowedMentions: { parse: [] },
    });
  }
}

export { data, execute, normalizeServiceRows };


export const groupedAction = { data, execute };
