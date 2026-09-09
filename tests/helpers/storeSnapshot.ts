import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface StoreSnapshot {
  commands: string[];
  handlers: string[];
  listeners: string[];
  preconditions: string[];
  containerBound: boolean;
  loggerBound: boolean;
}

let snapshotPromise: Promise<StoreSnapshot> | undefined;

function getStoreSnapshot(): Promise<StoreSnapshot> {
  snapshotPromise ??= inspectCompiledStores();
  return snapshotPromise;
}

async function inspectCompiledStores(): Promise<StoreSnapshot> {
  const script = `
    const { ArrakisClient } = require('./dist/src/client/ArrakisClient.js');
    const { container } = require('@sapphire/framework');
    const { GatewayIntentBits } = require('discord.js');
    (async () => {
      const client = new ArrakisClient({ intents: [GatewayIntentBits.Guilds] });
      await Promise.all([
        client.stores.get('commands').loadAll(),
        client.stores.get('interaction-handlers').loadAll(),
        client.stores.get('listeners').loadAll(),
        client.stores.get('preconditions').loadAll()
      ]);
      console.log(JSON.stringify({
        commands: [...client.stores.get('commands').keys()],
        handlers: [...client.stores.get('interaction-handlers').keys()],
        listeners: [...client.stores.get('listeners').keys()],
        preconditions: [...client.stores.get('preconditions').keys()],
        containerBound: container.client === client,
        loggerBound: container.logger === client.logger
      }));
      await client.destroy();
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const { stdout } = await execFileAsync(process.execPath, ["-e", script], { cwd: process.cwd() });
  return JSON.parse(stdout.trim()) as StoreSnapshot;
}

export { getStoreSnapshot };
export type { StoreSnapshot };
