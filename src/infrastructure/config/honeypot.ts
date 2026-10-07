interface HoneypotConfig {
  guildId: string;
  channelId: string;
  logChannelId: string;
  action: "ban" | "timeout" | "log";
  timeoutMinutes: number;
}

function loadHoneypotConfig(env: NodeJS.ProcessEnv): HoneypotConfig | undefined {
  const channelId = env.HONEYPOT_CHANNEL_ID?.trim();
  const logChannelId = env.HONEYPOT_LOG_CHANNEL_ID?.trim();
  if (!channelId && !logChannelId) return undefined;
  const guildId = env.GUILD_ID?.trim();
  for (const [name, value] of [["GUILD_ID", guildId], ["HONEYPOT_CHANNEL_ID", channelId], ["HONEYPOT_LOG_CHANNEL_ID", logChannelId]]) {
    if (!value || !/^\d{17,20}$/.test(value)) throw new Error(`${name} must be a valid Discord ID when the honeypot is enabled.`);
  }
  if (channelId === logChannelId) throw new Error("The honeypot and its log channel must be different.");
  const action = env.HONEYPOT_ACTION?.trim().toLowerCase() || "ban";
  if (action !== "ban" && action !== "timeout" && action !== "log") throw new Error("HONEYPOT_ACTION must be ban, timeout, or log.");
  const timeoutMinutes = Number(env.HONEYPOT_TIMEOUT_MINUTES?.trim() || 1440);
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 40320) throw new Error("HONEYPOT_TIMEOUT_MINUTES must be an integer from 1 to 40320.");
  return { guildId: guildId!, channelId: channelId!, logChannelId: logChannelId!, action, timeoutMinutes };
}

export { loadHoneypotConfig };
export type { HoneypotConfig };
