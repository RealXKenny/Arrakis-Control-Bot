import { Command } from "@sapphire/framework";
import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";
import { ConvoyApiError, type ConvoyClient } from "../../../infrastructure/http/convoy/ConvoyClient";
import { METRIC_PERIODS, METRIC_AGGREGATIONS, parseServerMetrics } from "../../../modules/server/usage/serverMetrics";
import { serverUsageImage } from "../../../modules/server/usage/serverUsageImage";

export const data = new SlashCommandBuilder().setName("server-usage").setDescription("View CPU, memory, network and disk resource graphs.")
  .addStringOption((option) => option.setName("server").setDescription("Convoy server UUID (choose a server or paste its UUID)").setRequired(true).setAutocomplete(true))
  .addStringOption((option) => option.setName("period").setDescription("History window (default: hour)").addChoices(...METRIC_PERIODS.map((value) => ({ name: value, value }))))
  .addStringOption((option) => option.setName("aggregation").setDescription("Average or maximum per time bucket").addChoices(...METRIC_AGGREGATIONS.map((value) => ({ name: value, value }))));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const api = interaction.client.convoyApi;
  if (!api) { await interaction.editReply("Convoy is not configured. Set API_URL and API_KEY, then restart the bot."); return; }
  const id = interaction.options.getString("server", true).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { await interaction.editReply("Choose a Convoy server or paste its full UUID from /server vps."); return; }
  const period = interaction.options.getString("period") ?? "hour";
  const aggregation = interaction.options.getString("aggregation") ?? "average";
  if (!METRIC_PERIODS.includes(period as never) || !METRIC_AGGREGATIONS.includes(aggregation as never)) { await interaction.editReply("Choose a supported period and aggregation."); return; }
  try {
    const metrics = parseServerMetrics(await api.request("GET", `/api/v1/client/servers/${id}/metrics`, { query: { period, aggregation } }));
    const cached = serverCache.get(api)?.rows.find((row) => row.uuid === id);
    const name = typeof cached?.name === "string" ? cached.name : id;
    const image = serverUsageImage(metrics, name);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xc58b45).setTitle("Server Resource Watch")
      .setDescription(`${period} history • ${aggregation} per bucket • Times in UTC${metrics.unavailable ? "\nMetrics are temporarily unavailable." : ""}`)
      .setImage("attachment://server-usage.png")], files: [new AttachmentBuilder(image, { name: "server-usage.png" })], allowedMentions: { parse: [] } });
  } catch (error) {
    const status = error instanceof ConvoyApiError ? error.status : undefined;
    const message = status === 401 ? "Convoy authentication failed. Check API_KEY."
      : status === 403 ? "Convoy access denied. Check server.read permission, the key's team and allowed IPs."
      : status === 404 ? "Server not found in this API key's team. Check the UUID."
      : status === 429 ? `Convoy is rate limiting requests. ${error instanceof ConvoyApiError && error.retryAfterSeconds !== undefined ? `Retry in ${error.retryAfterSeconds} seconds.` : "Try again shortly."}`
      : "Resource graphs are unavailable. Check Convoy connectivity and its metrics store, then try again.";
    interaction.client.logger.warn(`Server usage request failed${status !== undefined ? ` (HTTP ${status})` : " (invalid metrics or chart failure)"}.`);
    await interaction.editReply({ content: message, allowedMentions: { parse: [] } });
  }
}

const serverCache = new WeakMap<ConvoyClient, { rows: Record<string, unknown>[]; expires: number; pending?: Promise<Record<string, unknown>[]> }>();
async function serverChoices(api: ConvoyClient): Promise<Record<string, unknown>[]> {
  let cache = serverCache.get(api);
  if (!cache) { cache = { rows: [], expires: 0 }; serverCache.set(api, cache); }
  if (cache.expires > Date.now()) return cache.rows;
  const entry = cache;
  entry.pending ??= api.listServers().then((rows) => { entry.rows = rows; entry.expires = Date.now() + 60_000; return rows; })
    .catch(() => { entry.expires = Date.now() + 10_000; return entry.rows; }).finally(() => { entry.pending = undefined; });
  return entry.pending;
}
export class ServerUsageCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) { super(context, { ...options, name: "server-usage", description: "View Convoy resource graphs.", preconditions: ["InteractionRateLimit"] }); }
  public override registerApplicationCommands(registry: Command.Registry): void { registerApplicationCommand(registry, data); }
  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> { await execute(interaction); }
  public override async autocompleteRun(interaction: Command.AutocompleteInteraction): Promise<void> {
    const api = interaction.client.convoyApi;
    if (!api) { await interaction.respond([]); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const rows = await Promise.race([serverChoices(api), new Promise<Record<string, unknown>[]>((resolve) => { timer = setTimeout(() => resolve([]), 2_000); })]);
      const query = String(interaction.options.getFocused()).toLowerCase();
      await interaction.respond(rows.filter((row) => typeof row.uuid === "string" && `${row.name ?? row.hostname ?? ""} ${row.uuid}`.toLowerCase().includes(query))
        .slice(0, 25).map((row) => ({ name: `${row.name ?? row.hostname ?? "Server"} — ${row.uuid}`.slice(0, 100), value: String(row.uuid) })));
    } finally { clearTimeout(timer); }
  }
}
