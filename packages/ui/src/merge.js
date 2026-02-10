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
export function merge(obj1, obj2) {
  const result = { ...obj1 };

  for (let key in obj2) {
    if (Object.prototype.hasOwnProperty.call(obj2, key)) {
      if (obj2[key] instanceof Object && obj1[key] instanceof Object) {
        // Recursively merge nested objects
        result[key] = merge(obj1[key], obj2[key]);
      } else {
        // Override primitive or non-object values
        result[key] = obj2[key];
      }
    }
  }

  return result;
}

