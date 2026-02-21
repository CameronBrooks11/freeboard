/**
 * @module widgets/runtime/themeColors
 * @description Theme token helpers for widget rendering paths (DOM + canvas).
 */

const CHART_SLOT_COUNT = 8;

const readThemeToken = (tokenName: string): string => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return "";
  }
  if (!document.documentElement || typeof window.getComputedStyle !== "function") {
    return "";
  }
  return window.getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
};

export const resolveThemeColor = (tokenName: string, fallbackColor: string): string =>
  readThemeToken(tokenName) || fallbackColor;

export const resolveThemeChartColor = (seriesIndex: number, fallbackColor: string): string => {
  const normalizedIndex = Number.isFinite(seriesIndex) ? Math.floor(seriesIndex) : 0;
  const slot = ((normalizedIndex % CHART_SLOT_COUNT) + CHART_SLOT_COUNT) % CHART_SLOT_COUNT;
  return resolveThemeColor(`--chart-${slot + 1}`, fallbackColor);
};
