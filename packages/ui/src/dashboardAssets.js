/**
 * Dispose previously attached dashboard assets.
 *
 * @param {Record<string, { node?: { remove?: Function } }>} assets
 */
export const disposeDashboardAssets = (assets = {}) => {
  Object.values(assets).forEach((asset) => {
    asset?.node?.remove?.();
  });
};

