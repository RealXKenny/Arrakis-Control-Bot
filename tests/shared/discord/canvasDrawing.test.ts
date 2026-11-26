import { createCanvas } from "canvas";
import { describe, expect, it } from "vitest";
import { roundedRect, setFittedFont } from "../../../src/shared/discord/canvasDrawing";

describe("canvas drawing helpers", () => {
  it("shrinks the font until the text fits the width", () => {
    const context = createCanvas(400, 100).getContext("2d");
    setFittedFont(context, "Shai-Hulud", 60, 10, 200, "bold");
    const size = Number(/(\d+)px/.exec(context.font)?.[1]);
    expect(size).toBeLessThan(60);
    expect(context.measureText("Shai-Hulud").width).toBeLessThanOrEqual(200);
  });

  it("stops at the minimum size when the text never fits", () => {
    const context = createCanvas(400, 100).getContext("2d");
    setFittedFont(context, "W".repeat(200), 40, 18, 10, "bold");
    expect(context.font).toContain("18px");
  });

  it("clamps the corner radius to half the shortest side", () => {
    const context = createCanvas(100, 100).getContext("2d");
    roundedRect(context, 10, 10, 20, 60, 500);
    context.fillStyle = "#ffffff";
    context.fill();
    expect(context.getImageData(20, 40, 1, 1).data[3]).toBe(255);
    expect(context.getImageData(10, 10, 1, 1).data[3]).toBe(0);
  });
});
