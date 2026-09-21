import { describe, expect, it } from "vitest";

// @ts-expect-error The migration utility intentionally remains a directly runnable ESM script.
import { argumentsFrom, migrateEnvironment, parseEnvironment } from "../../scripts/migrate-env.mjs";

describe("production environment migration", () => {
  it("applies the boxed template without exposing or losing existing values", () => {
    const source = "TOKEN=very-secret\nOLD_SETTING='keep me'\nLOG_LEVEL=DEBUG\n";
    const template = "# ╭──╮\n# │ CORE │\n# ╰──╯\nTOKEN=replace_with_token\nLOG_LEVEL=INFO\nNEW_OPTION=replace_with_value\n";
    const result = migrateEnvironment(source, template);

    expect(result.content).toContain("TOKEN=very-secret");
    expect(result.content).toContain("LOG_LEVEL=DEBUG");
    expect(result.content).toContain("NEW_OPTION=\n");
    expect(result.content).toContain("CUSTOM AND LEGACY SETTINGS");
    expect(result.content).toContain("OLD_SETTING='keep me'");
    expect(result.custom).toBe(1);
  });

  it("uses the last duplicate value and parses safe command options", () => {
    expect(parseEnvironment("A=first\nA=second\n").entries.get("A")).toBe("second");
    expect(argumentsFrom(["--env", "/srv/bot/.env", "--check", "--no-backup"])).toMatchObject({
      envPath: "/srv/bot/.env",
      check: true,
      backup: false,
    });
  });
});
