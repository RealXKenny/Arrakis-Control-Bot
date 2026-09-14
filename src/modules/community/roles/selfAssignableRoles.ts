type RoleDefinition = [label: string, description: string, envName: string];

type RoleOption = {
  label: string;
  description: string;
  value: string;
};

const ROLE_DEFINITIONS: RoleDefinition[] = [
  ["⚔️ PvP", "Find warriors and join the fight.", "ROLE_PVP_ID"],
  ["🏹 PvE", "Hunt bosses, explore and conquer the desert.", "ROLE_PVE_ID"],
  ["🏗️ Builder", "Turn sand into strongholds.", "ROLE_BUILDER_ID"],
  ["⛏️ Crafter", "Gathering, crafting and production.", "ROLE_CRAFTER_ID"],
  ["💰 Trader", "Trade resources and dominate the Spice Market.", "ROLE_TRADER_ID"],
  ["🧭 Explorer", "Explore Arrakis and uncover its secrets.", "ROLE_EXPLORER_ID"],
  ["🔥 Endgame", "Take on the hardest content.", "ROLE_ENDGAME_ID"],
  ["🦅 House Atreides", "Honor, discipline and duty.", "ROLE_ATREIDES_ID"],
  ["🐍 House Harkonnen", "Power, ambition and domination.", "ROLE_HARKONNEN_ID"],
  ["🌵 Fremen", "Adapt to the desert. Become part of Arrakis.", "ROLE_FREMEN_ID"],
  ["⚖️ Neutral", "Walk your own path.", "ROLE_NEUTRAL_ID"],
  ["📢 Announcements", "Important server updates.", "ROLE_ANNOUNCEMENTS_ID"],
  ["🎉 Events", "Community events and activities.", "ROLE_EVENTS_ID"],
  ["☠️ PvP Alerts", "PvP-related announcements.", "ROLE_PVP_ALERTS_ID"],
  ["🏦 Market Alerts", "Trading and marketplace updates.", "ROLE_MARKET_ALERTS_ID"],
  ["👥 LFG Alerts", "Looking-for-group notifications.", "ROLE_LFG_ALERTS_ID"],
];

function getConfiguredRoleOptions(): RoleOption[] {
  return ROLE_DEFINITIONS.flatMap(([label, description, envName]) => {
    const value = process.env[envName];

    if (!value || value.startsWith("replace_with_")) {
      return [];
    }

    return [
      {
        label,
        description,
        value,
      },
    ];
  });
}

function getConfiguredRoleIds(): Set<string> {
  return new Set(getConfiguredRoleOptions().map((option) => option.value));
}

export { getConfiguredRoleIds, getConfiguredRoleOptions };
