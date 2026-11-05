/**
 * Shared visual language for every bot panel: one accent palette, semantic
 * status colors, and tiny text helpers so panels stay consistent.
 */
const PANEL_COLORS = Object.freeze({
  accent: 0x5b6cff,
  info: 0x3b9eff,
  violet: 0x9b6bff,
  success: 0x2ec27e,
  warning: 0xf5a524,
  danger: 0xe5484d,
  neutral: 0x2b2d31,
});

/** Accent rotation for informational cards that previously used a random desert tone. */
const PANEL_ACCENT_ROTATION: readonly number[] = Object.freeze([PANEL_COLORS.accent, PANEL_COLORS.info, PANEL_COLORS.violet]);

const PANEL_FOOTER_TAGLINE = "Arrakis Control";

function pickPanelAccent(random: () => number = Math.random): number {
  return PANEL_ACCENT_ROTATION[Math.floor(random() * PANEL_ACCENT_ROTATION.length)] ?? PANEL_COLORS.accent;
}

/** Subtext line shown at the bottom of a read-only panel. */
function panelFooter(requestedBy?: string, detail?: string): string {
  const parts = [PANEL_FOOTER_TAGLINE, detail, requestedBy ? `Requested by ${requestedBy}` : undefined].filter((part): part is string => Boolean(part));
  return `-# ${parts.join(" • ")}`;
}

/** Heading line: `## Title`, optionally preceded by a plain symbol. */
function panelHeading(title: string, level: 1 | 2 | 3 = 2): string {
  return `${"#".repeat(level)} ${title}`;
}

/** Status dot used instead of themed emoji. */
function statusDot(state: "ok" | "warn" | "bad" | "idle"): string {
  return { ok: "🟢", warn: "🟡", bad: "🔴", idle: "⚪" }[state];
}

export { PANEL_ACCENT_ROTATION, PANEL_COLORS, PANEL_FOOTER_TAGLINE, panelFooter, panelHeading, pickPanelAccent, statusDot };
