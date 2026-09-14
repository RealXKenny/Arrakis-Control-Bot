import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import { createContainer, createV2Response } from "../../../src/shared/discord/componentFactory";

describe("componentFactory", () => {
  it("truncates text, applies the default accent, and separates children", () => {
    const container = createContainer({ title: "T".repeat(600), body: "B".repeat(3_300), children: [(builder) => builder.addTextDisplayComponents((text) => text.setContent("child"))] }).toJSON();
    expect(container.accent_color).toBe(0xc58b45);
    expect(container.components).toHaveLength(4);
    expect((container.components[0] as { content: string }).content).toHaveLength(500);
    expect((container.components[1] as { content: string }).content).toHaveLength(3_200);
    expect(container.components[2]?.type).toBe(14);
  });

  it("creates a Components V2 response without mutating its inputs", () => {
    const components = [createContainer({ title: "Status" })];
    const files: never[] = [];
    expect(createV2Response(components, files)).toEqual({ components, files, flags: MessageFlags.IsComponentsV2 });
  });
});
