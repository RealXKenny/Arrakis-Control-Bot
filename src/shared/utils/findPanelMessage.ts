import type { Message } from "discord.js";

interface MessageChannel {
  messages: {
    fetch(options: { limit: number }): Promise<{
      find(predicate: (message: Message) => boolean): Message | undefined;
    }>;
  };
}

async function findPanelMessage(channel: MessageChannel, botUserId: string, marker: string): Promise<Message | null> {
  const messages = await channel.messages.fetch({ limit: 50 });

  return messages.find((message) => message.author.id === botUserId && containsText(message.components, marker)) ?? null;
}

function containsText(components: readonly unknown[], marker: string): boolean {
  return components.some((component) => {
    if (!component || typeof component !== "object") {
      return false;
    }

    const item = component as {
      content?: unknown;
      data?: {
        content?: unknown;
      };
      components?: readonly unknown[];
    };

    const content = typeof item.content === "string" ? item.content : typeof item.data?.content === "string" ? item.data.content : undefined;

    if (content?.includes(marker)) {
      return true;
    }

    return Array.isArray(item.components) && containsText(item.components, marker);
  });
}

export { findPanelMessage };
