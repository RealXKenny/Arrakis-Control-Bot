import { describe, expect, it } from "vitest";

import { discordValidationIssues } from "../../../src/shared/discord/discordValidation";

describe("Discord form validation diagnostics", () => {
  it("reports only the field path and code from a rejected message", () => {
    const error = {
      code: 50035,
      rawError: {
        errors: {
          components: {
            "0": { components: { "3": { components: { "0": { min_values: { _errors: [{ code: "NUMBER_TYPE_MIN", message: "secret value" }] } } } } } },
          },
        },
      },
    };

    expect(discordValidationIssues(error)).toEqual(["components.0.components.3.components.0.min_values: NUMBER_TYPE_MIN"]);
    expect(discordValidationIssues(error).join(" ")).not.toContain("secret value");
  });

  it("ignores unrelated errors", () => {
    expect(discordValidationIssues(new Error("failed"))).toEqual([]);
  });
});
