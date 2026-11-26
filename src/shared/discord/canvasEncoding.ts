import type { Canvas } from "canvas";

/**
 * Encodes on libuv's thread pool instead of the main thread. PNG compression is the
 * slowest part of a card, and blocking here would delay gateway heartbeats.
 */
function encodePng(canvas: Canvas): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    canvas.toBuffer((error, buffer) => (error ? reject(error) : resolve(buffer)), "image/png");
  });
}

/** Keeps recently rendered static images, keyed by their drawing inputs. */
class RenderCache {
  private readonly entries = new Map<string, Buffer>();

  public constructor(private readonly maxEntries = 32) {}

  public getOrRender(key: string, render: () => Buffer): Buffer {
    const cached = this.entries.get(key);
    if (cached) {
      // Refresh recency so frequently refreshed panels stay cached.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const rendered = render();
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, rendered);
    return rendered;
  }

  public get size(): number { return this.entries.size; }
}

export { encodePng, RenderCache };
