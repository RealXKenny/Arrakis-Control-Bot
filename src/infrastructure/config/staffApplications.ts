interface StaffApplicationConfig {
  panelChannelId: string;
  reviewChannelId: string;
  reviewerRoleId?: string;
  pendingRoleId?: string;
  acceptedRoleId?: string;
  cooldownDays: number;
}

function loadStaffApplicationConfig(env: NodeJS.ProcessEnv): StaffApplicationConfig | undefined {
  const panelChannelId = env.STAFF_APPLICATION_PANEL_CHANNEL_ID?.trim();
  const reviewChannelId = env.STAFF_APPLICATION_REVIEW_CHANNEL_ID?.trim();
  if (!panelChannelId && !reviewChannelId) return undefined;
  if (!panelChannelId || !reviewChannelId) throw new Error("STAFF_APPLICATION_PANEL_CHANNEL_ID and STAFF_APPLICATION_REVIEW_CHANNEL_ID must both be configured.");
  const id = (value: string | undefined, name: string): string | undefined => {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (!/^\d{17,20}$/.test(normalized)) throw new Error(`${name} must be a valid Discord ID.`);
    return normalized;
  };
  const cooldownDays = Number(env.STAFF_APPLICATION_COOLDOWN_DAYS || 7);
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 365) throw new Error("STAFF_APPLICATION_COOLDOWN_DAYS must be an integer from 0 to 365.");
  return {
    panelChannelId: id(panelChannelId, "STAFF_APPLICATION_PANEL_CHANNEL_ID")!,
    reviewChannelId: id(reviewChannelId, "STAFF_APPLICATION_REVIEW_CHANNEL_ID")!,
    reviewerRoleId: id(env.STAFF_APPLICATION_REVIEWER_ROLE_ID, "STAFF_APPLICATION_REVIEWER_ROLE_ID"),
    pendingRoleId: id(env.STAFF_APPLICATION_PENDING_ROLE_ID, "STAFF_APPLICATION_PENDING_ROLE_ID"),
    acceptedRoleId: id(env.STAFF_APPLICATION_ACCEPTED_ROLE_ID, "STAFF_APPLICATION_ACCEPTED_ROLE_ID"),
    cooldownDays,
  };
}

export { loadStaffApplicationConfig };
export type { StaffApplicationConfig };
