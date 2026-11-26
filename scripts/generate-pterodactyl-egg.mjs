import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const installationScript = `#!/bin/bash
set -euo pipefail

# Reinstalling over an existing installation must never overwrite, reset or re-permission the operator's files
# (.env, certificates, custom folders). Existing installs are updated by the automatic updater at startup, which checks
# every file for local changes first. To start over, empty the server's files deliberately first.
if [ -e /mnt/server/package.json ]; then
  echo "An existing installation was found in /home/container. Nothing was changed: the automatic updater installs new releases at startup without touching custom files."
  exit 0
fi

apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl jq tar coreutils findutils python3 make g++ pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
rm -rf /var/lib/apt/lists/*

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
release_file="$work_dir/release.json"
archive_file="$work_dir/source.tar.gz"
api='https://api.github.com/repos/RealXKenny/Arrakis-Control-Bot/releases'

# RELEASE_TAG pins an exact version (for example v2.1.0). Empty or "latest" installs the newest release.
tag="\${RELEASE_TAG:-latest}"
# Matched as one whole string: a multi-line value cannot slip a valid first line past a line-based grep.
tag_pattern='^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'
if [ "$tag" = "latest" ] || [ -z "$tag" ]; then
  release_url="$api/latest"
elif [[ "$tag" =~ $tag_pattern ]]; then
  release_url="$api/tags/$tag"
else
  echo "RELEASE_TAG must be latest or a version such as v2.1.0." >&2
  exit 1
fi

curl --fail --silent --show-error --location --retry 3 --header 'Accept: application/vnd.github+json' --header 'X-GitHub-Api-Version: 2022-11-28' "$release_url" --output "$release_file"

# Releases publish a source archive and its SHA-256 as assets. The archive is verified before anything in it runs.
release_tag=$(jq --exit-status --raw-output 'select(.draft == false and .prerelease == false) | .tag_name' "$release_file")
[[ "$release_tag" =~ $tag_pattern ]] || { echo "Invalid release tag." >&2; exit 1; }
if [ "$tag" != "latest" ] && [ -n "$tag" ] && [ "$tag" != "$release_tag" ]; then
  echo "Release tag did not match the requested version." >&2
  exit 1
fi
version="\${release_tag#v}"
asset_name="arrakis-control-bot-$version.tar.gz"
asset_count=$(jq --raw-output --arg name "$asset_name" '[.assets[]? | select(.name == $name)] | length' "$release_file")
sum_count=$(jq --raw-output --arg name "$asset_name.sha256" '[.assets[]? | select(.name == $name)] | length' "$release_file")
if [ "$asset_count" -gt 1 ] || [ "$sum_count" -gt 1 ]; then
  echo "The release contains duplicate archive assets." >&2
  exit 1
fi
asset_url=$(jq --raw-output --arg name "$asset_name" '[.assets[]? | select(.name == $name) | .browser_download_url] | if length == 1 then .[0] else empty end' "$release_file")
sum_url=$(jq --raw-output --arg name "$asset_name.sha256" '[.assets[]? | select(.name == $name) | .browser_download_url] | if length == 1 then .[0] else empty end' "$release_file")

if [ -n "$asset_url" ] && [ -n "$sum_url" ]; then
  [ "$asset_url" = "https://github.com/RealXKenny/Arrakis-Control-Bot/releases/download/$release_tag/$asset_name" ] || exit 1
  [ "$sum_url" = "$asset_url.sha256" ] || exit 1
  curl --fail --silent --show-error --location --retry 3 "$asset_url" --output "$archive_file"
  curl --fail --silent --show-error --location --retry 3 "$sum_url" --output "$work_dir/source.sha256"
  expected=$(awk '{print $1}' "$work_dir/source.sha256" | head -n 1)
  printf '%s' "$expected" | grep -Eq '^[0-9a-f]{64}$'
  echo "$expected  $archive_file" | sha256sum --check --status
  echo "Source archive checksum verified."
elif [ -z "$asset_url" ] && [ -z "$sum_url" ] && [ "\${ALLOW_UNVERIFIED_RELEASE:-false}" = "true" ]; then
  # Releases created before checksums were published install only when the operator explicitly accepts that.
  echo "WARNING: ALLOW_UNVERIFIED_RELEASE is true; installing the unverified GitHub source tarball." >&2
  download_url=$(jq --exit-status --raw-output '.tarball_url // empty' "$release_file")
  [ "$download_url" = "https://api.github.com/repos/RealXKenny/Arrakis-Control-Bot/tarball/$release_tag" ] || exit 1
  curl --fail --silent --show-error --location --retry 3 "$download_url" --output "$archive_file"
else
  # Fail closed: a release without a complete archive and checksum pair is not installed.
  echo "This release has no complete published checksum, so it cannot be verified. Install a newer release, or set ALLOW_UNVERIFIED_RELEASE=true to accept an unverified older one." >&2
  exit 1
fi

# Inspect the archive before anything is written: plain files and directories only (the project tracks no links),
# and no absolute or parent-directory paths. Here-strings avoid pipelines, so pipefail cannot hide a match.
member_types=$(tar -tvzf "$archive_file" | cut -c1)
member_names=$(tar -tzf "$archive_file")
if grep -Eq '^[^-d]' <<< "$member_types"; then
  echo "The release archive contains links or special files, which a release never needs; refusing to extract it." >&2
  exit 1
fi
if grep -Eq '(^/|(^|/)\\.\\.(/|$))' <<< "$member_names"; then
  echo "The release archive contains absolute or parent-directory paths; refusing to extract it." >&2
  exit 1
fi

mkdir -p /mnt/server
# Refuse existing symbolic links that could redirect extraction outside the install directory.
bad_link=$(find /mnt/server -type l -exec sh -c 'for link; do target=$(readlink -f "$link"); case "$target" in /mnt/server|/mnt/server/*) ;; *) echo "$link" ;; esac; done' sh {} + | head -n 1)
if [ -n "$bad_link" ]; then
  echo "The installation directory contains a symbolic link that points outside it." >&2
  exit 1
fi
tar -xzf "$archive_file" --strip-components=1 --no-same-owner --no-same-permissions -C /mnt/server
cd /mnt/server
# Canvas requires its native install step; run package scripts only as the unprivileged node user.
chown -R 1000:1000 /mnt/server
su -s /bin/bash node -c 'cd /mnt/server && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev --no-audit --no-fund && node -e "require(process.argv[1])" canvas'
`;

/**
 * Credentials. Pterodactyl hides a non-viewable variable from the server owner and subusers in the Startup tab; only
 * panel administrators can read or change it. That is panel access control, not encryption.
 */
const SECRET_VARIABLES = new Set([
  "TOKEN",
  "CONSOLE_API_KEY",
  "ADAPTER_TOKEN",
  "API_KEY",
  "DATABASE_URL",
  "RABBITMQ_URL",
  "LAVALINK_PASSWORD",
  "AUTO_UPDATE_GITHUB_TOKEN",
]);

/** Validation for settings with a fixed shape; everything else stays a free string validated by the bot at startup. */
const RULES = {
  CONSOLE_TIMEOUT_MS: "required|integer|min:1000|max:120000",
  AUTO_UPDATE_ENABLED: "required|string|in:true,false",
  AUTO_UPDATE_ON_STARTUP: "required|string|in:true,false",
  AUTO_UPDATE_CHANNEL: "required|string|in:stable,prerelease",
  AUTO_UPDATE_INTERVAL_HOURS: "required|integer|min:1|max:168",
  AUTO_UPDATE_WINDOW_UTC: "nullable|string|regex:/^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$/",
  AUTO_UPDATE_HEALTH_SECONDS: "required|integer|min:30|max:900",
  AUTO_UPDATE_GITHUB_TOKEN: "nullable|string|max:255",
};

const root = path.resolve(import.meta.dirname, "..");
const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const variables = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(([, key, rawDefault]) => {
  const required = ["TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY"].includes(key);
  const placeholder = rawDefault.startsWith("replace_with_") || rawDefault.startsWith("https://your-") || rawDefault.includes("replace_with_database_password");
  const defaultValue = placeholder ? "" : rawDefault;
  const labels = {
    TOKEN: "Discord Bot Token",
    DASHBOARD_URL: "Dashboard HTTPS Origin",
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
    DASHBOARD_URL: "HTTPS dashboard origin for Bot/Dashboard release announcements.",
    CONSOLE_URL: "Required HTTPS base URL for the Dune Console.",
    CONSOLE_API_KEY: "Required scoped Dune Console API key. Treat as a secret.",
    DATABASE_URL: "Optional PostgreSQL connection URL. Required for tickets, leveling, music state, and other persistent features.",
    RABBITMQ_CA_FILE: "Absolute path to a public CA PEM uploaded under /home/container. For example, /home/container/rabbitmq-ca.pem.",
    RABBITMQ_URL: "Optional AMQP(S) URL with encoded credentials. Treat as a secret.",
    CHAT_BRIDGE_ROUTES: "JSON array of {guildId, channelId, map} routes; required when RabbitMQ chat is enabled.",
    VOICE_GUILD_ID: "Optional Discord server ID override for voice rooms; otherwise GUILD_ID is used.",
    MUSIC_GUILD_ID: "Optional Discord server ID override for music; otherwise GUILD_ID is used.",
    ALLOWED_GUILD_IDS: "Comma-separated Discord server IDs the bot may stay in. Defaults to GUILD_ID; the bot leaves any other server.",
    TOTAL_SHARDS: "Number of Discord shards. Keep 1 for a single server; use auto only for very large multi-server installs.",
    DATABASE_POOL_MAX: "PostgreSQL connections for commands, panels and tickets. Default 10.",
    DATABASE_BACKGROUND_POOL_MAX: "PostgreSQL connections for the message archive and XP. Default 5.",
    DATABASE_STATEMENT_TIMEOUT_MS: "Longest a single database statement may run, in milliseconds. Default 15000.",
    MESSAGE_ARCHIVE_RETENTION_DAYS: "Delete archived messages older than this many days. 0 keeps everything. Deletion cannot be undone.",
    RUNTIME_METRICS_INTERVAL_SECONDS: "Seconds between runtime health summaries in the console. 0 turns them off. Default 60.",
    HEALTH_FILE: "Optional path the bot rewrites with its latest health snapshot, such as /home/container/health.json.",
    AUTO_UPDATE_ENABLED: "Check GitHub for verified releases and install them safely. Custom files are never overwritten.",
    AUTO_UPDATE_ON_STARTUP: "Check for an update each time the server starts.",
    AUTO_UPDATE_CHANNEL: "stable installs normal releases only; prerelease also installs release candidates.",
    AUTO_UPDATE_INTERVAL_HOURS: "Hours between background update checks (1-168).",
    AUTO_UPDATE_WINDOW_UTC: "Optional HH:MM-HH:MM UTC window for background installs, for example 03:00-05:00. Empty allows any time.",
    AUTO_UPDATE_HEALTH_SECONDS: "Seconds a new version must stay up after starting before it is kept (30-900).",
    AUTO_UPDATE_GITHUB_TOKEN: "Optional read-only GitHub token for release downloads. Never needs write access.",
  };
  const name = labels[key] ?? key.split("_").map((word) => word === "ID" ? "ID" : word[0] + word.slice(1).toLowerCase()).join(" ");
  return {
    name,
    description: details[key] ?? `${required ? "Required" : "Optional"} bot setting (${key}). See .env.example in the repository.`,
    env_variable: key,
    default_value: defaultValue,
    user_viewable: !SECRET_VARIABLES.has(key),
    user_editable: !SECRET_VARIABLES.has(key),
    rules: RULES[key] ?? (required ? "required|string" : "nullable|string"),
    field_type: "text",
  };
});

variables.unshift(
  { name: "Release Tag", description: "Version to install and stay on, such as v2.1.0, or latest to follow the update channel.", env_variable: "RELEASE_TAG", default_value: "latest", user_viewable: true, user_editable: true, rules: "required|string|max:16", field_type: "text" },
  { name: "Allow Unverified Release", description: "Allow an older release without a checksum; leave false for normal installations.", env_variable: "ALLOW_UNVERIFIED_RELEASE", default_value: "false", user_viewable: true, user_editable: true, rules: "required|string|in:true,false", field_type: "text" },
);

const names = variables.map((variable) => variable.env_variable);
if (new Set(names).size !== names.length) throw new Error("Duplicate .env.example variable names.");

const egg = {
  _comment: "Import this PTDL_v2 egg into a Pterodactyl nest. Generated from .env.example by scripts/generate-pterodactyl-egg.mjs.",
  meta: { version: "PTDL_v2", update_url: null },
  exported_at: "2026-09-21T00:00:00+00:00",
  name: "Arrakis Control Bot",
  author: "realxkenny@users.noreply.github.com",
  description: "Arrakis Control Discord bot. Installs a checksummed GitHub release using Node.js 24.",
  features: null,
  docker_images: { "Node.js 24": "ghcr.io/ptero-eggs/yolks:nodejs_24" },
  file_denylist: [],
  startup: "cd /home/container && exec node scripts/updater/supervisor.mjs",
  config: {
    files: "{}",
    startup: JSON.stringify({ done: "Discord shard" }),
    logs: "{}",
    stop: "^C",
  },
  scripts: {
    installation: {
      script: installationScript,
      container: "node:24-bookworm",
      entrypoint: "bash",
    },
  },
  variables,
};

const destination = path.join(root, "pterodactyl", "egg-arrakis-control-bot.json");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(egg, null, 2)}\n`);
process.stdout.write(`Wrote ${destination} with ${variables.length} environment variables.\n`);
