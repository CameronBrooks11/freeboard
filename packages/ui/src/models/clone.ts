/**
 * @module models/clone
 * @description Deep-clone a value into a fresh mutable object, returning the
 * given fallback for non-object input. Shared by the Pane/Widget/Datasource models.
 */

export const cloneMutable = <T>(value: unknown, fallback: T): T => {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value) as T;
    } catch {
      // Fallback below.
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
};
