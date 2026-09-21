export interface VoiceSetupConfig {
  guildId: string;
  joinChannelId: string;
  categoryId: string;
  panelChannelId: string;
}

export function loadVoiceSetup(env: NodeJS.ProcessEnv): VoiceSetupConfig | undefined {
  const keys = ["GUILD_ID", "VOICE_JOIN_CHANNEL_ID", "VOICE_CATEGORY_ID", "VOICE_PANEL_CHANNEL_ID"] as const;
  const values = [env.VOICE_GUILD_ID?.trim() || env.GUILD_ID?.trim() || "", ...keys.slice(1).map((key) => env[key]?.trim() ?? "")];
  if (values.slice(1).every((value) => !value)) return undefined;
  // Dev note: Half a voice-room map is just an expensive way to get lost.
  for (const [index, value] of values.entries()) {
    if (!/^\d{17,20}$/.test(value)) throw new Error(`${keys[index]} must be configured with a valid Discord ID when environment voice setup is used.`);
  }
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for environment voice setup.");
  return { guildId: values[0], joinChannelId: values[1], categoryId: values[2], panelChannelId: values[3] };
}
