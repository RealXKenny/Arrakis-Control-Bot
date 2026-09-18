import { createCanvas } from "canvas";
import type { ServerMetrics } from "./serverMetrics";
import { metricValue } from "./serverMetrics";

export function serverUsageImage(metrics: ServerMetrics, server: string): Buffer {
  const canvas = createCanvas(1400, 850);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111820"; ctx.fillRect(0, 0, 1400, 850);
  ctx.fillStyle = "#d6a65d"; ctx.font = "bold 28px sans-serif"; ctx.fillText("ARRAKIS CONTROL  /  RESOURCE WATCH", 32, 44);
  ctx.fillStyle = "#ccd6df"; ctx.font = "17px sans-serif"; ctx.fillText(`${server.slice(0, 65)}  |  ${metrics.period}  |  ${metrics.aggregation}  |  UTC`, 32, 76);
  const times = metrics.graphs.flatMap((graph) => graph.points.map((point) => point.time));
  const min = times.reduce((a, b) => Math.min(a, b), Infinity);
  const max = times.reduce((a, b) => Math.max(a, b), -Infinity);
  const timeLabel = (time: number) => { const date = new Date(time * 1000); return metrics.period === "hour" ? date.toISOString().slice(11, 16) : date.toISOString().slice(5, 16).replace("T", " "); };
  metrics.graphs.forEach((graph, index) => {
    const left = 24 + index % 2 * 688, top = 104 + Math.floor(index / 2) * 350;
    ctx.fillStyle = "#1b2530"; ctx.fillRect(left, top, 664, 330);
    ctx.strokeStyle = "#364351"; ctx.strokeRect(left, top, 664, 330);
    ctx.font = "bold 21px sans-serif"; ctx.fillStyle = "#f0f3f6"; ctx.fillText(graph.title, left + 20, top + 34);
    const values = graph.points.flatMap((point) => point.values.filter((value): value is number => value !== null));
    if (!values.length) { ctx.font = "17px sans-serif"; ctx.fillStyle = "#aebbc8"; ctx.fillText(metrics.unavailable ? "Metrics store unavailable" : "No samples for this window", left + 20, top + 167); return; }
    const peak = values.reduce((a, b) => Math.max(a, b), 0);
    const ceiling = graph.unit === "percent" ? Math.max(100, Math.ceil(peak / 25) * 25) : Math.max(1, peak * 1.15);
    const x = left + 96, y = top + 72, width = 542, height = 190;
    ctx.font = "12px sans-serif";
    for (let tick = 0; tick <= 4; tick++) {
      const yy = y + height * tick / 4;
      ctx.strokeStyle = "#34404c"; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + width, yy); ctx.stroke();
      ctx.fillStyle = "#adbac7"; ctx.textAlign = "right"; ctx.fillText(metricValue(ceiling * (1 - tick / 4), graph.unit), x - 10, yy + 4); ctx.textAlign = "left";
    }
    for (let tick = 0; tick <= 3; tick++) {
      ctx.textAlign = tick === 3 ? "right" : tick === 0 ? "left" : "center";
      ctx.fillStyle = "#adbac7"; ctx.fillText(timeLabel(min + (max - min) * tick / 3), x + width * tick / 3, y + height + 25); ctx.textAlign = "left";
    }
    graph.labels.forEach((label, seriesIndex) => {
      ctx.strokeStyle = graph.colors[seriesIndex]; ctx.lineWidth = 2; ctx.beginPath(); let drawing = false;
      for (const point of graph.points) {
        const value = point.values[seriesIndex];
        if (value === null) { drawing = false; continue; }
        const xx = x + (max === min ? 0.5 : (point.time - min) / (max - min)) * width, yy = y + height * (1 - value / ceiling);
        if (drawing) ctx.lineTo(xx, yy); else { ctx.moveTo(xx, yy); drawing = true; }
        if (graph.points.length === 1) { ctx.fillStyle = graph.colors[seriesIndex]; ctx.fillRect(xx - 2, yy - 2, 4, 4); }
      }
      ctx.stroke();
      const latest = [...graph.points].reverse().find((point) => point.values[seriesIndex] !== null)?.values[seriesIndex];
      ctx.font = "14px sans-serif"; ctx.fillStyle = graph.colors[seriesIndex];
      ctx.fillText(`${label}: ${latest == null ? "unavailable" : metricValue(latest, graph.unit)}`, left + 20 + seriesIndex * 315, top + 310);
    });
  });
  ctx.font = "13px sans-serif"; ctx.fillStyle = "#a0adba"; ctx.fillText("Live Convoy snapshot • Latest available values shown • Gaps are not zero usage", 32, 831);
  return canvas.toBuffer("image/png");
}
