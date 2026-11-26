import { createCanvas } from "canvas";
import { expect, it, vi } from "vitest";

import { encodePng, RenderCache } from "../../../src/shared/discord/canvasEncoding";
import { createPanelBanner } from "../../../src/shared/discord/imageFactory";

it("encodes a PNG without blocking on the main thread", async () => {
  const png = await encodePng(createCanvas(4, 4));
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
});

it("reuses rendered images and evicts the least recently used", () => {
  const cache = new RenderCache(2);
  const render = vi.fn(() => Buffer.from("x"));
  cache.getOrRender("a", render);
  cache.getOrRender("b", render);
  cache.getOrRender("a", render);
  cache.getOrRender("c", render);
  expect(render).toHaveBeenCalledTimes(3);
  cache.getOrRender("a", render);
  expect(render).toHaveBeenCalledTimes(3);
  cache.getOrRender("b", render);
  expect(render).toHaveBeenCalledTimes(4);
});

it("returns the same banner bytes for the same inputs", () => {
  const first = createPanelBanner({ artwork: "voice", filename: "a.png", title: "Voice", subtitle: "Rooms" });
  const second = createPanelBanner({ artwork: "voice", filename: "b.png", title: "Voice", subtitle: "Rooms" });
  expect(second.attachment).toBe(first.attachment);
  expect(second.name).toBe("b.png");
});
