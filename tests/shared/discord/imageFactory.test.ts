import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PANEL_ARTWORK_KEYS, createDuneBanner } from "../../../src/shared/discord/imageFactory";

describe("panel artwork factory", () => {
  it("renders a unique bounded PNG for every registered panel family", () => {
    const hashes = new Set<string>();

    for (const artwork of PANEL_ARTWORK_KEYS) {
      const banner = createDuneBanner({ artwork, filename: `${artwork}.png`, title: "Arrakis Control", subtitle: "PANEL TEST", detail: artwork.toUpperCase() });
      const image = banner.attachment;
      expect(Buffer.isBuffer(image)).toBe(true);
      expect((image as Buffer).subarray(1, 4).toString()).toBe("PNG");
      expect((image as Buffer).byteLength).toBeLessThan(10 * 1024 * 1024);
      expect(banner.description).toContain("Arrakis Control");
      hashes.add(createHash("sha256").update(image as Buffer).digest("hex"));
    }

    expect(PANEL_ARTWORK_KEYS).toHaveLength(25);
    expect(hashes).toHaveLength(PANEL_ARTWORK_KEYS.length);
  }, 15_000);
});
