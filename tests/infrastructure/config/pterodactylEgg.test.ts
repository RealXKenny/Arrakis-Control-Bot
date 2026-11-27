import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface EggVariable {
  env_variable: string;
  default_value: string;
  rules: string;
  user_viewable: boolean;
  user_editable: boolean;
}

interface Egg {
  meta: { version: string };
  docker_images: Record<string, string>;
  startup: string;
  config: { startup: string; stop: string };
  scripts: { installation: { script: string; container: string; entrypoint: string } };
  variables: EggVariable[];
}

const root = path.resolve(__dirname, "../../..");
const egg = JSON.parse(fs.readFileSync(path.join(root, "pterodactyl", "egg-arrakis-control-bot.json"), "utf8")) as Egg;
const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");

describe("Pterodactyl egg", () => {
  it("exposes an optional dashboard URL for changelog announcements", () => {
    expect(egg.variables.find((variable) => variable.env_variable === "DASHBOARD_URL")).toMatchObject({
      default_value: "", rules: "nullable|string", user_viewable: true, user_editable: true,
    });
  });
  it("exposes every documented bot setting once without placeholder credentials", () => {
    const documented = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
    const included = egg.variables.map((variable) => variable.env_variable);

    expect(included).toEqual(["RELEASE_TAG", "ALLOW_UNVERIFIED_RELEASE", ...documented]);
    expect(new Set(included).size).toBe(included.length);
    expect(egg.variables.some((variable) => variable.default_value.includes("replace_with_"))).toBe(false);
    for (const key of ["TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY"]) {
      expect(egg.variables.find((variable) => variable.env_variable === key)).toMatchObject({
        default_value: "",
        rules: "required|string",
      });
    }
  });

  it("installs a verified source release and waits for a shard readiness message", () => {
    expect(egg.meta.version).toBe("PTDL_v2");
    expect(Object.values(egg.docker_images)).toEqual(["ghcr.io/ptero-eggs/yolks:nodejs_24"]);
    expect(egg.startup).toBe("cd /home/container && exec node scripts/updater/supervisor.mjs");
    expect(fs.existsSync(path.join(root, "scripts/updater/supervisor.mjs"))).toBe(true);
    const release = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).arrakisRelease as { start: string[]; readyPattern: string };
    expect(release.start).toEqual(["node", "dist/src/index.js"]);
    // The updater's health check waits for the same line the panel does, but only for a ready shard, never an error.
    expect(release.readyPattern.startsWith(JSON.parse(egg.config.startup).done)).toBe(true);
    expect(new RegExp(release.readyPattern).test("Discord shard 0 is ready.")).toBe(true);
    expect(new RegExp(release.readyPattern).test("Discord shard 0 process exited unexpectedly.")).toBe(false);
    expect(egg.scripts.installation.container).toBe("node:24-bookworm");
    const installer = egg.scripts.installation.script;
    expect(installer).toContain("sha256sum --check --status");
    expect(installer).toContain("select(.draft == false and .prerelease == false)");
    expect(installer).toContain("duplicate archive assets");
    expect(installer).toContain("tar -tvzf");
    expect(installer).toContain("su -s /bin/bash node");
    expect(installer.indexOf("sha256sum --check --status")).toBeLessThan(installer.indexOf('tar -xzf'));
    expect(JSON.parse(egg.config.startup)).toEqual({ done: "Discord shard" });
    expect(egg.config.stop).toBe("^C");
  });
});

describe("egg secrets and configuration sync", () => {
  it("hides every credential from panel users and ships no real values", () => {
    for (const key of ["TOKEN", "CONSOLE_API_KEY", "ADAPTER_TOKEN", "API_KEY", "DATABASE_URL", "RABBITMQ_URL", "LAVALINK_PASSWORD", "AUTO_UPDATE_GITHUB_TOKEN"]) {
      expect(egg.variables.find((variable) => variable.env_variable === key), key).toMatchObject({
        user_viewable: false,
        user_editable: false,
        default_value: "",
      });
    }
  });

  it("offers every setting the bot reads and nothing it does not", () => {
    const source = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? source(path.join(directory, entry.name)) : entry.name.endsWith(".ts") ? [path.join(directory, entry.name)] : [],
      );
    const code = source(path.join(root, "src")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
    const internal = new Set(["NODE_ENV", "BOT_VERSION", "SHARDS", "DISCORD_SHARD_ID"]);
    const read = new Set([...code.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]).filter((key) => !internal.has(key) && !/^(TERM|COLUMNS|NO_COLOR|FORCE_COLOR)$/.test(key)));
    const offered = new Set(egg.variables.map((variable) => variable.env_variable));
    expect([...read].filter((key) => !offered.has(key))).toEqual([]);
    const deployment = new Set(["RELEASE_TAG", "ALLOW_UNVERIFIED_RELEASE"]);
    for (const variable of egg.variables) {
      if (deployment.has(variable.env_variable) || variable.env_variable.startsWith("AUTO_UPDATE_")) continue;
      expect(code, variable.env_variable).toContain(variable.env_variable);
    }
  });

  it("is regenerated from .env.example", () => {
    const documented = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
    expect(documented.filter((key) => key.startsWith("AUTO_UPDATE_"))).toHaveLength(9);
  });
});
