export interface VoiceSetupConfig {
  guildId: string;
  joinChannelId: string;
  categoryId: string;
  panelChannelId: string;
}

export function loadVoiceSetup(env: NodeJS.ProcessEnv): VoiceSetupConfig | undefined {
  const keys = ["VOICE_GUILD_ID", "VOICE_JOIN_CHANNEL_ID", "VOICE_CATEGORY_ID", "VOICE_PANEL_CHANNEL_ID"] as const;
  const values = keys.map((key) => env[key]?.trim() ?? "");
  if (values.every((value) => !value)) return undefined;
  for (const [index, value] of values.entries()) {
    if (!/^\d{17,20}$/.test(value)) throw new Error(`${keys[index]} must be configured with a valid Discord ID when environment voice setup is used.`);
  }
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for environment voice setup.");
  return { guildId: values[0], joinChannelId: values[1], categoryId: values[2], panelChannelId: values[3] };
}
