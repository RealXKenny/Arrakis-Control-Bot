import { expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { parseServerMetrics, metricValue } from "../../../../src/modules/server/usage/serverMetrics";
import { serverUsageImage } from "../../../../src/modules/server/usage/serverUsageImage";
import { execute, data } from "../../../../src/commands/server/monitoring/server-usage";
import { ConvoyApiError } from "../../../../src/infrastructure/http/convoy/ConvoyClient";
const sample = { period: "hour", aggregation: "average", unavailable: null, series: {
  cpu: [{ time: 100, cpu: 0.25 }, { time: 130, cpu: null }], mem: [{ time: 100, mem: 2147483648 }],
  net: [{ time: 100, netin: 1024, netout: 2048 }], disk: [{ time: 100, diskread: 4096, diskwrite: 8192 }],
} };
const id = "3f6f7a18-91c4-4ad7-8f61-2d79c1b7a240";
function interaction(server = id) {
  const request = vi.fn().mockResolvedValue(sample);
  const editReply = vi.fn();
  return { request, editReply, value: { client: { convoyApi: { request }, logger: { warn: vi.fn() } },
    options: { getString: (name: string) => name === "server" ? server : null }, deferReply: vi.fn(), editReply } as unknown as ChatInputCommandInteraction };
}
it("reads all six resource series, converts CPU fractions and preserves gaps", () => {
  const metrics = parseServerMetrics(sample);
  expect(metrics.graphs).toHaveLength(4);
  expect(metrics.graphs[0].points.map((point) => point.values[0])).toEqual([25, null]);
  expect(metricValue(metrics.graphs[1].points[0].values[0]!, "bytes")).toBe("2.0 GiB");
  expect(metrics.graphs[2].points[0].values).toEqual([1024, 2048]);
  expect(metrics.graphs[3].points[0].values).toEqual([4096, 8192]);
  expect(serverUsageImage(metrics, "Server").subarray(1, 4).toString()).toBe("PNG");
});
it("renders unavailable and empty windows without inventing zero usage", () => {
  for (const value of [{ ...sample, unavailable: "Store down" }, { ...sample, series: {} }]) {
    const metrics = parseServerMetrics(value);
    expect(metrics.graphs.every((graph) => graph.points.length === 0)).toBe(true);
    expect(serverUsageImage(metrics, "Server").length).toBeGreaterThan(1000);
  }
});
it("rejects malformed envelopes and resource arrays", () => {
  expect(() => parseServerMetrics({})).toThrow();
  expect(() => parseServerMetrics({ ...sample, series: { cpu: "invalid" } })).toThrow();
});
it("offers every documented time window and aggregation", () => {
  const options = data.toJSON().options!;
  const period = options.find((option) => option.name === "period")!;
  expect("choices" in period && period.choices?.map((choice) => choice.value)).toEqual(["hour", "day", "week", "month", "year"]);
});
it("fetches every resource graph with one authenticated-client request", async () => {
  const fixture = interaction();
  await execute(fixture.value);
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith("GET", `/api/v1/client/servers/${id}/metrics`, { query: { period: "hour", aggregation: "average" } });
  expect(fixture.editReply).toHaveBeenCalledWith(expect.objectContaining({ files: expect.any(Array), embeds: expect.any(Array) }));
});
it("rejects invalid server identifiers before making an API call", async () => {
  const fixture = interaction("../account");
  await execute(fixture.value);
  expect(fixture.request).not.toHaveBeenCalled();
});
it("reports rate limits without leaking error details", async () => {
  const fixture = interaction();
  fixture.request.mockRejectedValue(new ConvoyApiError("private response", 429, "private body", 30));
  await execute(fixture.value);
  expect(fixture.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("30 seconds") }));
  expect(JSON.stringify(fixture.editReply.mock.calls)).not.toContain("private");
});
