import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } from "discord.js";
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
    const response = createV2Response(components, files);
    expect(response.flags).toBe(MessageFlags.IsComponentsV2);
    expect(response.components).toHaveLength(2);
    expect(response.files).toHaveLength(1);
    expect(components).toHaveLength(1);
    expect(files).toHaveLength(0);
  });

  it("preserves panels that already provide their own visual", () => {
    const panel = new ContainerBuilder().addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://existing.png")));
    const response = createV2Response([panel], [{ attachment: Buffer.from("image"), name: "existing.png" }]);
    expect(response.components).toEqual([panel]);
    expect(response.files).toHaveLength(1);
  });
});
