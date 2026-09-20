export async function readBoundedBody(response: Response, maximumBytes: number, limitMessage: string): Promise<Buffer> {
  // Dev note: Trust Content-Length like a smuggler's manifest: verify while unloading.
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new RangeError("Invalid response size limit.");
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(limitMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}
