/**
 * Dispose previously attached dashboard assets.
 *
 * @param {Record<string, { node?: { remove?: Function } }>} assets
 */
export const disposeDashboardAssets = (assets: Record<string, unknown> = {}) => {
  Object.values(assets).forEach((asset) => {
    const node = (asset as { node?: { remove?: () => void } } | null | undefined)?.node;
    node?.remove?.();
  });
};
