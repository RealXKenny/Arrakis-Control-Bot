import { describe, expect, it } from "vitest";
import { channelLabel, guildListLabel } from "../../../src/shared/discord/logLabels";

describe("log labels", () => {
  it("shows a cached channel name with its id and falls back to the id", () => {
    expect(channelLabel({ id: "100000000000000001", name: "honeypot" }, "100000000000000001")).toBe("#honeypot (100000000000000001)");
    expect(channelLabel(undefined, "100000000000000002")).toBe("100000000000000002");
    expect(channelLabel({ id: "100000000000000003", name: " " }, "100000000000000003")).toBe("100000000000000003");
  });

  it("names a few servers and counts the rest", () => {
    expect(guildListLabel([{ id: "200000000000000001", name: "Arrakis" }])).toBe("1 server(s): Arrakis (200000000000000001)");
    expect(guildListLabel([])).toBe("0 server(s)");
    const many = Array.from({ length: 5 }, (_, index) => ({ id: `20000000000000000${index}`, name: `S${index}` }));
    expect(guildListLabel(many, 2)).toBe("5 server(s): S0 (200000000000000000), S1 (200000000000000001), +3 more");
  });
});
