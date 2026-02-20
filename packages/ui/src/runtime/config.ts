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

export const runtimeConfig = Object.freeze({
  isStaticBuild: readStaticBuildFlag(),
  basePath: readBasePath(),
  version: readVersion(),
});
