import { AttachmentBuilder, ComponentType, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type AttachmentPayload, type APIMessageTopLevelComponent } from "discord.js";
import { truncateDiscordText } from "./discordLimits";
import { createDuneBanner } from "./imageFactory";

const TEMPORARY_IMAGE_NAME = "arrakis-temporary-response.png";

type ContainerChild = (container: ContainerBuilder) => void;

interface CreateContainerOptions {
  title?: string;
  body?: string;
  color?: number;
  children?: ContainerChild[];
}

function createContainer({ title, body, color = 0xc58b45, children = [] }: CreateContainerOptions): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(color);

  if (title) {
    container.addTextDisplayComponents((text) => text.setContent(truncateDiscordText(title, 500)));
  }

  if (body) {
    container.addTextDisplayComponents((text) => text.setContent(truncateDiscordText(body, 3_200)));
  }

  if (children.length) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
  }

  for (const child of children) {
    child(container);
  }

  return container;
}

type V2Component = APIMessageTopLevelComponent | ContainerBuilder;

type V2File = AttachmentPayload | AttachmentBuilder;

interface V2Response {
  components: V2Component[];
  files: V2File[];
  flags: MessageFlags.IsComponentsV2;
}

function createV2Response(components: V2Component[], files: V2File[] = []): V2Response {
  // Dev note: Every container needs its V2 passport stamped at Discord's border.
  if (!components.some(hasMediaGallery)) {
    const visual = new ContainerBuilder().setAccentColor(0xc58b45)
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
        .setURL(`attachment://${TEMPORARY_IMAGE_NAME}`).setDescription("Arrakis Control temporary response banner")));
    components = [visual, ...components];
    files = [createDuneBanner({ artwork: "temporary", filename: TEMPORARY_IMAGE_NAME, title: "Arrakis Control", subtitle: "FIELD RESPONSE", detail: "SIGNAL RECEIVED • ACTION RECORDED" }), ...files];
  }
  return {
    components,
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

function hasMediaGallery(component: V2Component): boolean {
  const value = "toJSON" in component && typeof component.toJSON === "function" ? component.toJSON() : component;
  return containsMediaGallery(value);
}

function containsMediaGallery(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMediaGallery);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.type === ComponentType.MediaGallery || Object.values(record).some(containsMediaGallery);
}

export { TEMPORARY_IMAGE_NAME, createContainer, createV2Response };

export type { CreateContainerOptions, ContainerChild, V2Response, V2Component, V2File };
