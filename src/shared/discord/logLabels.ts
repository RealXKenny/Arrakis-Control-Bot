/** Labels for console logs: the cached name when Discord already gave us one, always with the stable id. */

interface NamedTarget {
  readonly id: string;
  readonly name?: string | null;
}

function channelLabel(channel: NamedTarget | null | undefined, fallbackId: string): string {
  const name = channel?.name?.trim();
  return name ? `#${name} (${channel!.id})` : fallbackId;
}

function guildListLabel(guilds: Iterable<NamedTarget>, limit = 3): string {
  const all = [...guilds];
  const shown = all.slice(0, limit).map((guild) => (guild.name?.trim() ? `${guild.name.trim()} (${guild.id})` : guild.id));
  const more = all.length > limit ? `, +${all.length - limit} more` : "";
  return `${all.length} server(s)${shown.length ? `: ${shown.join(", ")}${more}` : ""}`;
}

export { channelLabel, guildListLabel };
