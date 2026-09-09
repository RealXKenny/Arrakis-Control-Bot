import { describe, expect, it } from "vitest";

import { getStoreSnapshot } from "../helpers/storeSnapshot";

describe("ArrakisClient composition", () => {
  it("binds the active client and logger to Sapphire's container", async () => {
    const snapshot = await getStoreSnapshot();
    expect(snapshot.containerBound).toBe(true);
    expect(snapshot.loggerBound).toBe(true);
  });
});
