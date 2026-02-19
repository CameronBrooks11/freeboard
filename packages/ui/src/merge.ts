/**
 * @module merge
 * @description Utility to recursively deep merge two objects, combining nested properties.
 */

/**
 * Merge two objects deeply.
 *
 * @param {Object} obj1 - Base object to merge into.
 * @param {Object} obj2 - Object with overrides or additional properties.
 * @returns {Object} New object with merged properties.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export function merge(
  obj1: Record<string, unknown>,
  obj2: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj1 };

  for (const key in obj2) {
    if (Object.prototype.hasOwnProperty.call(obj2, key)) {
      const left = obj1[key];
      const right = obj2[key];
      if (isRecord(left) && isRecord(right)) {
        // Recursively merge nested objects
        result[key] = merge(left, right);
      } else {
        // Override primitive or non-object values
        result[key] = right;
      }
    }
  }

  return result;
}
