/// <reference types="vite/client" />

declare const __FREEBOARD_VERSION__: string;
declare const __FREEBOARD_STATIC__: "true" | "false";
declare const __FREEBOARD_BASE_PATH__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
