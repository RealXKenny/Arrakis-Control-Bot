import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface EggVariable {
  env_variable: string;
  default_value: string;
  rules: string;
}

interface Egg {
  meta: { version: string };
  docker_images: Record<string, string>;
  startup: string;
  config: { startup: string; stop: string };
  variables: EggVariable[];
}

const root = path.resolve(__dirname, "../../..");
const egg = JSON.parse(fs.readFileSync(path.join(root, "pterodactyl", "egg-arrakis-control-bot.json"), "utf8")) as Egg;
const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");

describe("Pterodactyl egg", () => {
  it("exposes every documented bot setting once without placeholder credentials", () => {
    const documented = [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
    const included = egg.variables.map((variable) => variable.env_variable);

    expect(included).toEqual(documented);
    expect(new Set(included).size).toBe(included.length);
    expect(egg.variables.some((variable) => variable.default_value.includes("replace_with_"))).toBe(false);
    for (const key of ["TOKEN", "CONSOLE_URL", "CONSOLE_API_KEY"]) {
      expect(egg.variables.find((variable) => variable.env_variable === key)).toMatchObject({
        default_value: "",
        rules: "required|string",
      });
    }
  });

  it("uses the published image and waits for a shard readiness message", () => {
    expect(egg.meta.version).toBe("PTDL_v2");
    expect(Object.values(egg.docker_images)).toEqual(["ghcr.io/realxkenny/arrakis-control-bot:latest"]);
    expect(egg.startup).toBe("cd /opt/arrakis && exec node dist/src/index.js");
    expect(JSON.parse(egg.config.startup)).toEqual({ done: "Discord shard" });
    expect(egg.config.stop).toBe("^C");
  });
});
