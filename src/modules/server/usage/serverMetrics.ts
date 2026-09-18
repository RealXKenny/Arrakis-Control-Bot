export const METRIC_PERIODS = ["hour", "day", "week", "month", "year"] as const;
export const METRIC_AGGREGATIONS = ["average", "maximum"] as const;
export interface MetricPoint { time: number; values: (number | null)[] }
export interface ResourceGraph { title: string; labels: string[]; colors: string[]; unit: "percent" | "bytes" | "rate"; points: MetricPoint[] }
export interface ServerMetrics { period: string; aggregation: string; unavailable: boolean; graphs: ResourceGraph[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function parseServerMetrics(value: unknown): ServerMetrics {
  if (!object(value) || !METRIC_PERIODS.includes(value.period as never) || !METRIC_AGGREGATIONS.includes(value.aggregation as never)) throw new Error("Invalid metrics response.");
  const unavailable = typeof value.unavailable === "string" && value.unavailable.length > 0;
  if (!unavailable && !object(value.series)) throw new Error("Missing metrics series.");
  const series = object(value.series) ? value.series : {};
  const definitions = [
    { key: "cpu", title: "CPU Usage", fields: ["cpu"], labels: ["CPU"], colors: ["#20c9a0"], unit: "percent" as const, scale: 100 },
    { key: "mem", title: "Memory Usage", fields: ["mem"], labels: ["Memory"], colors: ["#ac82f5"], unit: "bytes" as const, scale: 1 },
    { key: "net", title: "Network Traffic", fields: ["netin", "netout"], labels: ["In", "Out"], colors: ["#4d94ff", "#15d5eb"], unit: "rate" as const, scale: 1 },
    { key: "disk", title: "Disk Throughput", fields: ["diskread", "diskwrite"], labels: ["Read", "Write"], colors: ["#f5b64d", "#fa6383"], unit: "rate" as const, scale: 1 },
  ];
  return { period: String(value.period), aggregation: String(value.aggregation), unavailable, graphs: definitions.map((definition) => {
    const raw = series[definition.key];
    if (raw !== undefined && !Array.isArray(raw)) throw new Error("Invalid resource series.");
    if (Array.isArray(raw) && raw.length > 25_000) throw new Error("Resource series exceeds the chart limit.");
    const points = (unavailable || !Array.isArray(raw) ? [] : raw).filter((point) => object(point) && typeof point.time === "number" && Number.isFinite(point.time) && point.time >= 0 && point.time < 8.64e12)
      .map((point) => ({ time: point.time as number, values: definition.fields.map((field) => typeof point[field] === "number" && Number.isFinite(point[field]) && point[field] >= 0 ? point[field] * definition.scale : null) }))
      .sort((a, b) => a.time - b.time);
    return { ...definition, points };
  }) };
}
export function metricValue(value: number, unit: ResourceGraph["unit"]): string {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}${unit === "rate" ? "/s" : ""}`;
}
