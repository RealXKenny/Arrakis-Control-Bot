// Regenerates every bundled panel/card background in data/images/ with the modern
// gradient-and-geometry style. Output is deterministic: run `node scripts/generate-panel-artwork.mjs`.
// Backgrounds carry no text; the bot overlays titles at runtime (src/shared/discord/imageFactory.ts).
import { createCanvas } from "canvas";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "images");

// [hueA, hueB, motif]
const PANELS = {
  backups: [205, 235, "stack"], blueprint: [190, 225, "grid"], "bot-control": [235, 270, "rings"], "bot-info": [225, 265, "rings"],
  faq: [260, 300, "dots"], goodbye: [250, 330, "waves"], market: [150, 190, "bars"], music: [285, 330, "waves"], ping: [175, 215, "rings"],
  "player-link": [200, 250, "links"], players: [215, 260, "dots"], profile: [230, 290, "dots"], release: [255, 295, "stack"],
  roles: [270, 320, "dots"], rules: [225, 255, "grid"], "server-info": [210, 240, "grid"], "server-status": [160, 205, "bars"],
  "staff-application": [240, 285, "links"], storm: [195, 275, "waves"], temporary: [230, 260, "rings"], tickets: [220, 270, "links"],
  verification: [150, 200, "rings"], voice: [265, 315, "waves"], vps: [200, 240, "stack"], welcome: [215, 285, "dots"],
};
const CARDS = {
  "achievement-level-banner": [255, 305, "rings", 1200, 400], "achievement-message-banner": [215, 255, "dots", 1200, 400],
  "achievement-voice-banner": [175, 215, "waves", 1200, 400], "level-up-banner": [235, 285, "rings", 1200, 400],
  "community-level-background": [235, 275, "grid", 2172, 724], "community-level-leaderboard-background": [230, 290, "dots", 1586, 992],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function render(name, [hueA, hueB, motif, width = 1200, height = 400]) {
  const random = rng([...name].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7));
  const canvas = createCanvas(width, height);
  const c = canvas.getContext("2d");
  const u = height / 400;

  const base = c.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, hsl(hueA, 45, 9));
  base.addColorStop(0.55, hsl(hueA, 40, 13));
  base.addColorStop(1, hsl(hueB, 45, 18));
  c.fillStyle = base;
  c.fillRect(0, 0, width, height);

  // Soft colour glows anchored to the right so the text side stays calm.
  for (const [x, y, r, hue, a] of [[0.82, 0.2, 0.75, hueB, 0.55], [0.98, 0.95, 0.6, hueA, 0.45], [0.6, 0.0, 0.45, hueB + 30, 0.28]]) {
    const g = c.createRadialGradient(width * x, height * y, 0, width * x, height * y, height * r * 1.6);
    g.addColorStop(0, hsl(hue, 85, 58, a));
    g.addColorStop(1, hsl(hue, 85, 58, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, width, height);
  }

  c.save();
  c.lineWidth = 2 * u;
  const rightX = width * 0.52;
  if (motif === "grid") {
    c.strokeStyle = hsl(hueB, 80, 75, 0.12);
    for (let x = rightX; x < width; x += 48 * u) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, height); c.stroke(); }
    for (let y = 0; y < height; y += 48 * u) { c.beginPath(); c.moveTo(rightX, y); c.lineTo(width, y); c.stroke(); }
  } else if (motif === "dots") {
    for (let x = rightX; x < width; x += 36 * u) for (let y = 18 * u; y < height; y += 36 * u) {
      c.fillStyle = hsl(hueB, 85, 78, 0.06 + random() * 0.22);
      c.beginPath(); c.arc(x, y, (2 + random() * 3.5) * u, 0, Math.PI * 2); c.fill();
    }
  } else if (motif === "rings") {
    for (let i = 0; i < 6; i++) {
      c.strokeStyle = hsl(hueB, 85, 72, 0.22 - i * 0.03);
      c.beginPath(); c.arc(width * 0.82, height * 0.5, (70 + i * 48) * u, 0, Math.PI * 2); c.stroke();
    }
  } else if (motif === "waves") {
    for (let i = 0; i < 7; i++) {
      c.strokeStyle = hsl(hueB, 85, 72, 0.28 - i * 0.03);
      c.beginPath();
      for (let x = rightX - 60 * u; x <= width; x += 8 * u) {
        const y = height * (0.3 + i * 0.07) + Math.sin(x / (70 * u) + i * 0.8) * 26 * u;
        if (x === rightX - 60 * u) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  } else if (motif === "bars") {
    for (let i = 0; i < 12; i++) {
      const h = (0.2 + random() * 0.55) * height;
      c.fillStyle = hsl(hueB, 80, 65, 0.10 + random() * 0.14);
      c.beginPath(); c.roundRect(rightX + i * 46 * u, height - h - 30 * u, 28 * u, h, 8 * u); c.fill();
    }
  } else if (motif === "stack") {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = hsl(hueB, 80, 65, 0.07 + i * 0.04);
      c.strokeStyle = hsl(hueB, 85, 78, 0.28);
      c.beginPath(); c.roundRect(width * 0.62 + i * 26 * u, height * 0.18 + i * 40 * u, 320 * u, 96 * u, 18 * u); c.fill(); c.stroke();
    }
  } else if (motif === "links") {
    const nodes = Array.from({ length: 9 }, () => [rightX + random() * (width - rightX - 30 * u), 30 * u + random() * (height - 60 * u)]);
    c.strokeStyle = hsl(hueB, 85, 75, 0.22);
    nodes.forEach((a, i) => { const b = nodes[(i + 3) % nodes.length]; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); });
    nodes.forEach(([x, y]) => { c.fillStyle = hsl(hueB, 90, 80, 0.55); c.beginPath(); c.arc(x, y, 6 * u, 0, Math.PI * 2); c.fill(); });
  }
  c.restore();

  // Thin accent rule along the bottom edge.
  const rule = c.createLinearGradient(0, 0, width, 0);
  rule.addColorStop(0, hsl(hueA, 90, 62, 0.9));
  rule.addColorStop(1, hsl(hueB, 90, 66, 0.9));
  c.fillStyle = rule;
  c.fillRect(0, height - 5 * u, width, 5 * u);

  fs.writeFileSync(path.join(outDir, `${name}.png`), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

fs.mkdirSync(outDir, { recursive: true });
for (const [key, spec] of Object.entries(PANELS)) render(`panel-${key}`, spec);
for (const [name, spec] of Object.entries(CARDS)) render(name, spec);
process.stdout.write(`Generated ${Object.keys(PANELS).length + Object.keys(CARDS).length} images in ${outDir}
`);
