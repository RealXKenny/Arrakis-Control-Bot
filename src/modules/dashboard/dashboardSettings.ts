import type { FrameworkSettingsDefinition } from "../../infrastructure/http/dashboard/DashboardFramework";

/** Settings shown by the management dashboard. Add an option here only together
 * with the bot code that reads it, so the dashboard never offers a control
 * that changes nothing.
 */
export const DASHBOARD_SETTINGS: FrameworkSettingsDefinition = Object.freeze({ categories: {} });
