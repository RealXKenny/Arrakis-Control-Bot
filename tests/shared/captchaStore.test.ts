import { describe, expect, it } from "vitest";

import { createCaptcha, verifyCaptcha } from "../../src/shared/utils/captchaStore";

describe("captchaStore", () => {
  it("creates a fixed-length code without ambiguous characters", () => {
    const code = createCaptcha("captcha-format-user");

    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("accepts a valid code once and consumes failed attempts", () => {
    const validCode = createCaptcha("captcha-valid-user");

    expect(verifyCaptcha("captcha-valid-user", validCode.toLowerCase())).toBe(true);
    expect(verifyCaptcha("captcha-valid-user", validCode)).toBe(false);

    const failedCode = createCaptcha("captcha-failed-user");

    expect(verifyCaptcha("captcha-failed-user", "WRONG1")).toBe(false);
    expect(verifyCaptcha("captcha-failed-user", failedCode)).toBe(false);
  });
});
