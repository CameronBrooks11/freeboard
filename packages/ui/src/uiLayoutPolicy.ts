/**
 * @module uiLayoutPolicy
 * @description Runtime UI layout/interaction policy helpers used by components and tests.
 */

import { LOGIN_ACTION_MODES, type LoginActionMode } from "./auth/loginMode";

/**
 * Determine whether the forgot-password action should render in dialog footer.
 */
export const shouldShowForgotPasswordFooterAction = (actionMode: LoginActionMode): boolean =>
  actionMode === LOGIN_ACTION_MODES.login;

/**
 * Determine whether MQTT datasource quick-create hint should be shown.
 */
export const shouldShowBrokerProfileQuickCreate = ({
  datasourceType,
  brokerProfilesCount,
}: {
  datasourceType: unknown;
  brokerProfilesCount: unknown;
}): boolean => {
  const normalizedType = String(datasourceType || "")
    .trim()
    .toLowerCase();
  const normalizedCount = Math.max(0, Math.floor(Number(brokerProfilesCount) || 0));
  return normalizedType === "mqtt" && normalizedCount === 0;
};

/**
 * Determine whether dashboard board should use stacked small-layout rendering.
 */
export const isSmallDashboardLayout = (dashboardWidth: unknown): boolean => {
  const normalizedWidth = String(dashboardWidth || "")
    .trim()
    .toLowerCase();
  return normalizedWidth === "sm";
};
