import { AttachmentBuilder, ContainerBuilder, MessageFlags, SeparatorSpacingSize, type AttachmentPayload, type APIMessageTopLevelComponent } from "discord.js";
import { truncateDiscordText } from "../utils/discordLimits";

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
  return {
    components,
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

export { createContainer, createV2Response };

export type { CreateContainerOptions, ContainerChild, V2Response, V2Component, V2File };
