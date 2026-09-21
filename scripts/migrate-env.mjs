#!/usr/bin/env node
import { copyFile, readFile, rename, stat, unlink, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const PLACEHOLDER = /^(?:replace_with_|https:\/\/your-|postgresql:\/\/arrakis:replace_with_)/;

function parseEnvironment(source) {
  const entries = new Map();
  const order = [];
  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line.match(ASSIGNMENT);
    if (!match) continue;
    const [, key, value] = match;
    if (!entries.has(key)) order.push(key);
    entries.set(key, value);
  }
  return { entries, order };
}

function migrateEnvironment(source, template) {
  const current = parseEnvironment(source);
  const templateKeys = new Set();
  const lines = template.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => {
    const match = line.match(ASSIGNMENT);
    if (!match) return line;
    const [, key, defaultValue] = match;
    templateKeys.add(key);
    const existing = current.entries.get(key);
    if (existing !== undefined) return `${key}=${existing}`;
    return `${key}=${PLACEHOLDER.test(defaultValue) ? "" : defaultValue}`;
  });

  const customKeys = current.order.filter((key) => !templateKeys.has(key));
  if (customKeys.length) {
    while (lines.at(-1) === "") lines.pop();
    lines.push(
      "",
      "# ╭────────────────────────────────────────────────────────────────╮",
      "# │ CUSTOM AND LEGACY SETTINGS                                     │",
      "# ╰────────────────────────────────────────────────────────────────╯",
      "",
      ...customKeys.map((key) => `${key}=${current.entries.get(key) ?? ""}`),
    );
  }

  return { content: `${lines.join("\n").replace(/\n+$/, "")}\n`, known: templateKeys.size, custom: customKeys.length };
}

function argumentsFrom(values) {
  const options = { envPath: ".env", templatePath: ".env.example", backup: true, check: false };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === "--env") options.envPath = requiredArgument(values, ++index, "--env");
    else if (value === "--template") options.templatePath = requiredArgument(values, ++index, "--template");
    else if (value === "--no-backup") options.backup = false;
    else if (value === "--check") options.check = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  return options;
}

function requiredArgument(values, index, option) {
  const value = values[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a path.`);
  return value;
}

async function migrateFile(options) {
  const envPath = path.resolve(options.envPath);
  const templatePath = path.resolve(options.templatePath);
  const [source, template, metadata] = await Promise.all([readFile(envPath, "utf8"), readFile(templatePath, "utf8"), stat(envPath)]);
  const migrated = migrateEnvironment(source, template);
  if (options.check) return { ...migrated, envPath, backupPath: null, changed: migrated.content !== source };
  if (migrated.content === source) return { ...migrated, envPath, backupPath: null, changed: false };

  // Dev note: Even the Bene Gesserit keep a backup before rearranging the prophecy.
  let backupPath = null;
  if (options.backup) {
    backupPath = await availableBackupPath(envPath);
    await copyFile(envPath, backupPath);
  }

  const temporaryPath = `${envPath}.migrating-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, migrated.content, { encoding: "utf8", mode: metadata.mode });
    await chmod(temporaryPath, metadata.mode);
    await rename(temporaryPath, envPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return { ...migrated, envPath, backupPath, changed: true };
}

async function availableBackupPath(envPath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "-").replace(/\..+/, "");
  for (let suffix = 0; ; suffix++) {
    const candidate = `${envPath}.backup-${stamp}${suffix ? `-${suffix}` : ""}`;
    try {
      await stat(candidate);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

function usage() {
  return [
    "Usage: npm run env:migrate -- [--env /path/to/.env] [--template /path/to/.env.example] [--check] [--no-backup]",
    "",
    "Rebuilds an existing environment file using the boxed .env.example layout.",
    "Existing values and unknown custom keys are preserved; secret values are never printed.",
  ].join("\n");
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await migrateFile(options);
  const mode = options.check ? result.changed ? "needs migration" : "already current" : result.changed ? "migrated" : "already current";
  process.stdout.write(`Environment ${mode}: ${result.envPath}\n`);
  process.stdout.write(`Template keys: ${result.known} | Custom keys preserved: ${result.custom}\n`);
  if (result.backupPath) process.stdout.write(`Backup created: ${result.backupPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Environment migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { argumentsFrom, migrateEnvironment, migrateFile, parseEnvironment };
