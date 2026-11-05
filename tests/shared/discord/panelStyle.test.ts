import { describe, expect, it } from "vitest";
import { PANEL_ACCENT_ROTATION, PANEL_COLORS, panelFooter, panelHeading, pickPanelAccent, statusDot } from "../../../src/shared/discord/panelStyle";

describe("panelStyle", () => {
  it("keeps semantic colors distinct and within the 24-bit range", () => {
    const values = Object.values(PANEL_COLORS);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toBeLessThanOrEqual(0xffffff);
  });

  it("picks accents deterministically from the rotation", () => {
    expect(pickPanelAccent(() => 0)).toBe(PANEL_ACCENT_ROTATION[0]);
    expect(pickPanelAccent(() => 0.999)).toBe(PANEL_ACCENT_ROTATION.at(-1));
  });

  it("formats footers, headings and status dots", () => {
    expect(panelFooter("Ada", "3 backups")).toBe("-# Arrakis Control • 3 backups • Requested by Ada");
    expect(panelFooter()).toBe("-# Arrakis Control");
    expect(panelHeading("Status", 3)).toBe("### Status");
    expect(statusDot("ok")).toBe("🟢");
  });
});
