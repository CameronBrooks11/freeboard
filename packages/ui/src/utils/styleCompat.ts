/**
 * @module utils/styleCompat
 * @description Small DOM style compatibility helpers for browser and test runtimes.
 */

/**
 * Set a CSS property with a fallback for lightweight test DOM style mocks.
 *
 * @param {CSSStyleDeclaration} style
 * @param {string} propertyName
 * @param {string} value
 */
export const setStylePropertyCompat = (
  style: CSSStyleDeclaration,
  propertyName: string,
  value: string,
) => {
  if (typeof style.setProperty === "function") {
    style.setProperty(propertyName, value);
    return;
  }

  const camelCaseProperty = propertyName.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  const mutableStyle = style as CSSStyleDeclaration & Record<string, string>;
  mutableStyle[camelCaseProperty] = value;
};
