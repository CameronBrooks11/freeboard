/**
 * @module monaco
 * @description Sets up Monaco editor environment with Web Worker factories for different languages.
 */

import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

/**
 * Global MonacoEnvironment configuration to provide language-specific web workers.
 * @memberof module:monaco
 * @type {{ getWorker: function(unknown, string): Worker }}
 */
type MonacoEnvironmentConfig = {
  getWorker: (_: unknown, label: string) => Worker;
};

const monacoEnvironment: MonacoEnvironmentConfig = {
  /**
   * Factory returning the appropriate Worker instance based on language label.
   *
   * @param {unknown} _ - Placeholder for worker context (unused).
   * @param {string} label - Language label, e.g., "json", "css", "html", "typescript".
   * @returns {Worker} Worker instance for the specified language.
   */
  getWorker(_: unknown, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    // Use generic editor worker for JS/TS modes to avoid bundling the heavy TS language-service worker.
    // We retain syntax highlighting while intentionally skipping TS semantic tooling in dashboard editors.
    if (label === "typescript" || label === "javascript") {
      return new editorWorker();
    }
    return new editorWorker();
  },
};

(
  globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoEnvironmentConfig;
  }
).MonacoEnvironment = monacoEnvironment;

/**
 * The configured Monaco editor instance with custom worker environment.
 * @type {typeof monaco}
 */
export default monaco;
