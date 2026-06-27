/**
 * @module runtime/config
 * @description Central runtime config facade for compile-time Freeboard constants.
 */

const readStaticBuildFlag = (): boolean =>
  typeof __FREEBOARD_STATIC__ !== "undefined" ? __FREEBOARD_STATIC__ : false;

const readBasePath = (): string =>
  typeof __FREEBOARD_BASE_PATH__ !== "undefined" ? __FREEBOARD_BASE_PATH__ : "/";

const readVersion = (): string =>
  typeof __FREEBOARD_VERSION__ !== "undefined" ? __FREEBOARD_VERSION__ : "0.0.0-dev";

// Immutable-display (Lite read-only) sub-profile: a static build serves a
// view-only board when loaded with `?readonly` (or `?readonly=1`/`true`). It is
// a runtime switch on the same static build — no separate artifact — so one
// deployment can serve both editable and read-only URLs (e.g. an iframe `src`
// or a kiosk URL). Only honoured in a static build; the full app's edit rights
// come from auth, not the URL.
const readReadonlyFlag = (isStaticBuild: boolean): boolean => {
  if (!isStaticBuild || typeof window === "undefined") {
    return false;
  }
  try {
    const value = new URLSearchParams(window.location.search).get("readonly");
    return value !== null && value !== "0" && value !== "false";
  } catch {
    return false;
  }
};

const isStaticBuild = readStaticBuildFlag();

export const runtimeConfig = Object.freeze({
  isStaticBuild,
  isReadonly: readReadonlyFlag(isStaticBuild),
  basePath: readBasePath(),
  version: readVersion(),
});
