import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const variables = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(([, key, rawDefault]) => {
  const required = ["TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY"].includes(key);
  const placeholder = rawDefault.startsWith("replace_with_") || rawDefault.startsWith("https://your-") || rawDefault.includes("replace_with_database_password");
  const defaultValue = placeholder ? "" : rawDefault;
  const labels = {
    TOKEN: "Discord Bot Token",
    CLIENT_ID: "Discord Application ID",
    GUILD_ID: "Discord Server ID",
    CONSOLE_URL: "Dune Console URL",
    CONSOLE_API_KEY: "Dune Console API Key",
    DATABASE_URL: "PostgreSQL URL",
    RABBITMQ_URL: "RabbitMQ URL",
    RABBITMQ_CA_FILE: "RabbitMQ CA File",
    LAVALINK_URL: "Lavalink URL",
    LAVALINK_PASSWORD: "Lavalink Password",
  };
  const details = {
    TOKEN: "Required. Discord bot token. Treat as a secret.",
    CONSOLE_URL: "Required HTTPS base URL for the Dune Console.",
    CONSOLE_API_KEY: "Required scoped Dune Console API key. Treat as a secret.",
    DATABASE_URL: "Optional PostgreSQL connection URL. Required for tickets, leveling, music state, and other persistent features.",
    RABBITMQ_CA_FILE: "Absolute path to a public CA PEM uploaded under /home/container. For example, /home/container/rabbitmq-ca.pem.",
    RABBITMQ_URL: "Optional AMQP(S) URL with encoded credentials. Treat as a secret.",
    CHAT_BRIDGE_ROUTES: "JSON array of {guildId, channelId, map} routes; required when RabbitMQ chat is enabled.",
    VOICE_GUILD_ID: "Optional Discord server ID override for voice rooms; otherwise GUILD_ID is used.",
    MUSIC_GUILD_ID: "Optional Discord server ID override for music; otherwise GUILD_ID is used.",
  };
  const name = labels[key] ?? key.split("_").map((word) => word === "ID" ? "ID" : word[0] + word.slice(1).toLowerCase()).join(" ");
  return {
    name,
    description: details[key] ?? `${required ? "Required" : "Optional"} bot setting (${key}). See .env.example in the repository.`,
    env_variable: key,
    default_value: defaultValue,
    user_viewable: true,
    user_editable: true,
    rules: required ? "required|string" : "nullable|string",
    field_type: "text",
  };
});

const names = variables.map((variable) => variable.env_variable);
if (new Set(names).size !== names.length) throw new Error("Duplicate .env.example variable names.");

const egg = {
  _comment: "Import this PTDL_v2 egg into a Pterodactyl nest. Generated from .env.example by scripts/generate-pterodactyl-egg.mjs.",
  meta: { version: "PTDL_v2", update_url: null },
  exported_at: "2026-09-21T00:00:00+00:00",
  name: "Arrakis Control Bot",
  author: "realxkenny@users.noreply.github.com",
  description: "Arrakis Control Discord bot. Runs the prebuilt GitHub Container Registry image; configure secrets and optional integrations using the egg variables.",
  features: null,
  docker_images: { "Arrakis Control Bot (GHCR)": "ghcr.io/realxkenny/arrakis-control-bot:latest" },
  file_denylist: [],
  startup: "cd /opt/arrakis && exec node dist/src/index.js",
  config: {
    files: "{}",
    startup: JSON.stringify({ done: "Discord shard" }),
    logs: "{}",
    stop: "^C",
  },
  scripts: {
    installation: {
      script: "#!/bin/sh\nset -eu\nmkdir -p /mnt/server\necho 'Arrakis Control Bot is bundled in the Docker image. No files to install.'\n",
      container: "ghcr.io/pterodactyl/installers:alpine",
      entrypoint: "ash",
    },
  },
  variables,
};

const destination = path.join(root, "pterodactyl", "egg-arrakis-control-bot.json");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(egg, null, 2)}\n`);
process.stdout.write(`Wrote ${destination} with ${variables.length} environment variables.\n`);
