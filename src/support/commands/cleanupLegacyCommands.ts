import { ApplicationCommandType, type Client } from "discord.js";
import { scopedLogger } from "../../client/logger";

export async function cleanupLegacyCommands(client: Client, expected: ReadonlySet<string>): Promise<void> {
  // Dev note: Guild command ghosts can still overshadow their global descendants.
  const logger = scopedLogger(client.logger, "COMMANDS");
  if (!client.application || !expected.size) return;
  const globals = await client.application.commands.fetch();
  const names = new Set(globals.filter((command) => command.type === ApplicationCommandType.ChatInput).map((command) => command.name));
  if (names.size !== expected.size || [...expected].some((name) => !names.has(name))) {
    logger.warn("Cleanup deferred: the current global command list is not confirmed.");
    return;
  }
  let removed = 0, failures = 0;
  let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const guilds = await client.guilds.fetch({ limit: 200, ...(after ? { after } : {}) });
    for (const guild of guilds.values()) {
      // Dev note: Old commands are like sand: harmless until they get everywhere.
      try {
        const commands = await client.application.commands.fetch({ guildId: guild.id });
        for (const command of commands.values()) {
          if (command.type !== ApplicationCommandType.ChatInput) continue;
          try { await client.application.commands.delete(command.id, guild.id); removed++; }
          catch { failures++; }
        }
      } catch { failures++; }
    }
    if (guilds.size < 200) {
      logger.info(`${names.size} global slash commands synchronized; removed ${removed} obsolete server-specific command(s).`);
      if (failures) logger.warn(`${failures} cleanup operation(s) failed; startup will retry next time.`);
      return;
    }
    after = guilds.last()!.id;
  }
  logger.warn("Cleanup reached its server-list limit; some server-specific commands may remain.");
}
