import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

// Usage: node scripts/sync-dashboard-changelog.mjs <dashboard-worktree>
const dashboard = process.argv[2];
if (!dashboard || process.argv.length !== 3) throw new Error("Provide the dashboard worktree path.");
const source = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const normalized = source.replace(/\r\n/g, "\n");
const firstRelease = normalized.search(/^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/m);
if (firstRelease < 0) throw new Error("No dated stable bot releases found.");
const history = normalized.slice(firstRelease).trimEnd() + "\n";
const headings = [...history.matchAll(/^## (.*)$/gm)];
const versions = new Set();
for (const heading of headings) {
  const match = /^\[((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\] - (\d{4}-\d{2}-\d{2})$/.exec(heading[1]);
  if (!match || versions.has(match[1]) || Number.isNaN(Date.parse(match[2])) || new Date(match[2]).toISOString().slice(0, 10) !== match[2]) {
    throw new Error(`Invalid or duplicate bot release heading: ${heading[0]}`);
  }
  versions.add(match[1]);
}
const target = path.resolve(dashboard, "docs/changelog/bot.md");
const temporary = `${target}.tmp`;
const marker = "<!-- Generated from the bot repository CHANGELOG.md; do not edit manually. -->";
const existing = await readFile(target, "utf8").catch((error) => {
  if (error.code === "ENOENT") return undefined;
  throw error;
});
if (existing !== undefined && !existing.startsWith(`# Arrakis Control Bot release history\n\n${marker}\n`)) {
  throw new Error("Refusing to overwrite a file that is not the generated bot history.");
}
const output = `# Arrakis Control Bot release history\n\n${marker}\n\n${history}`;
if (existing === output) process.exit(0);
await writeFile(temporary, output, { flag: "wx" });
try { await rename(temporary, target); } catch (error) {
  await unlink(temporary).catch(() => {});
  throw error;
}
