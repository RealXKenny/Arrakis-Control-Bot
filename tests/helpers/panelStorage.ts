import type { PanelStorage, StoredPanel } from "../../src/infrastructure/database/panels/PanelRepository";

function createPanelStorage(): PanelStorage {
  const records = new Map<string, StoredPanel>();
  const active = new Set<string>();
  return {
    withPanel: async (channelId, panelKey, task) => {
      const key = `${channelId}:${panelKey}`;
      if (active.has(key)) return;
      active.add(key);
      try {
        await task({
          get: () => Promise.resolve(records.get(key) ?? null),
          save: (messageId, renderKey = null) => {
            records.set(key, { messageId, renderKey });
            return Promise.resolve();
          },
        });
      } finally { active.delete(key); }
    },
  };
}

export { createPanelStorage };
