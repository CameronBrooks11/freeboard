/**
 * @module monaco
 * @description Sets up Monaco editor environment with Web Worker factories for different languages.
 */

import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

/**
 * Global MonacoEnvironment configuration to provide language-specific web workers.
 * @memberof module:monaco
 * @type {{ getWorker: function(unknown, string): Worker }}
 */
self.MonacoEnvironment = {
  /**
   * Factory returning the appropriate Worker instance based on language label.
   *
   * @param {unknown} _ - Placeholder for worker context (unused).
   * @param {string} label - Language label, e.g., "json", "css", "html", "typescript".
   * @returns {Worker} Worker instance for the specified language.
   */
  getWorker(_, label) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

/**
 * The configured Monaco editor instance with custom worker environment.
 * @type {typeof monaco}
 */
export default monaco;
