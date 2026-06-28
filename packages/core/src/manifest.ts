/**
 * @module manifest
 * @description Declarative, headless plugin manifest — the single source of
 * truth for datasource/widget VALIDATION + DISCOVERY (not form rendering).
 * Pure, fully-serializable data: no Ajv, no DOM, no Vue, no functions, no labels.
 *
 * This is intentionally NOT the UI's `fields()` form descriptor (which carries
 * labels/controls/defaults/form-required and stays in `packages/ui`). It encodes
 * only what the server validates and what an external agent/SDK needs to discover
 * valid authoring options. Slice 1 ships the data + the resource limits; the
 * validator that consumes it lands in a later slice.
 */

/** JSON value kinds a manifest field may hold. */
export type ManifestDataType = "string" | "number" | "integer" | "boolean" | "object" | "array";

/**
 * One validated/discoverable settings field of a plugin. Constraints are
 * declarative and mirror the current server semantics exactly (see
 * `validateDashboardDatasources`).
 */
export interface ManifestField {
  /** The `settings` key, e.g. "url", "qos". */
  name: string;
  /** Value kind(s); a union (e.g. `["string","array"]`) is allowed. Enforced only when `typeCheck`. */
  dataType: ManifestDataType | ManifestDataType[];
  /** Validation-required (server semantics). For strings, the trimmed value must be non-empty. */
  required?: boolean;
  /** Optional, but if the key IS present an empty/whitespace string is rejected. */
  nonEmpty?: boolean;
  /** Allowed values (compared as trimmed strings, after `coerce`). */
  enum?: (string | number)[];
  /** Inclusive numeric bounds, compared after `Number()` coercion. */
  min?: number;
  max?: number;
  /** Case fold applied ONLY for comparison; never rewrites the stored value. */
  coerce?: "upper" | "lower";
  /** Becomes non-empty-required when a sibling field equals a value (e.g. queryParamName when authPlacement === "query"). */
  requiredWhen?: { field: string; equals: string | number };
  /** When true, `dataType` is enforced; otherwise `dataType` is discovery metadata only. */
  typeCheck?: boolean;
  /** Discovery hint: this field references a server-side profile. Existence is NEVER validated (portability). */
  ref?: "credentialProfile" | "brokerProfile";
}

/** A single plugin's validation + discovery contract. */
export interface PluginManifestEntry {
  kind: "datasource" | "widget";
  /** Registry key and the document `type` value. */
  typeName: string;
  /** Build profiles the plugin is available in. */
  profiles: ("lite" | "server")[];
  /** Flat list of validated/discoverable settings fields. No sections, labels, defaults, or UI controls. */
  fields: ManifestField[];
}

const LITE_AND_SERVER: ("lite" | "server")[] = ["lite", "server"];
const SERVER_ONLY: ("lite" | "server")[] = ["server"];

/**
 * The plugin manifest. Datasource entries are 1:1 with the server rules in
 * `validateDashboardDatasources` (authored to the server's leniency, not the
 * stricter UI form). Widget entries are added in a later slice.
 */
export const PLUGIN_MANIFEST: PluginManifestEntry[] = [
  {
    kind: "datasource",
    typeName: "http",
    profiles: LITE_AND_SERVER,
    fields: [
      { name: "url", dataType: "string", required: true },
      {
        name: "method",
        dataType: "string",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        coerce: "upper",
      },
      { name: "parser", dataType: "string", enum: ["json", "text", "csv"], coerce: "lower" },
      { name: "credentialProfileId", dataType: "string", nonEmpty: true, ref: "credentialProfile" },
    ],
  },
  { kind: "datasource", typeName: "clock", profiles: LITE_AND_SERVER, fields: [] },
  { kind: "datasource", typeName: "static", profiles: LITE_AND_SERVER, fields: [] },
  {
    kind: "datasource",
    typeName: "sse",
    profiles: SERVER_ONLY,
    fields: [
      { name: "url", dataType: "string", required: true },
      { name: "parser", dataType: "string", enum: ["json", "text"], coerce: "lower" },
      { name: "authPlacement", dataType: "string", enum: ["header", "query"], coerce: "lower" },
      {
        name: "queryParamName",
        dataType: "string",
        requiredWhen: { field: "authPlacement", equals: "query" },
      },
      { name: "credentialProfileId", dataType: "string", nonEmpty: true, ref: "credentialProfile" },
    ],
  },
  {
    kind: "datasource",
    typeName: "websocket",
    profiles: SERVER_ONLY,
    fields: [
      { name: "url", dataType: "string", required: true },
      { name: "parser", dataType: "string", enum: ["json", "text"], coerce: "lower" },
      { name: "authPlacement", dataType: "string", enum: ["header", "query"], coerce: "lower" },
      {
        name: "queryParamName",
        dataType: "string",
        requiredWhen: { field: "authPlacement", equals: "query" },
      },
      { name: "credentialProfileId", dataType: "string", nonEmpty: true, ref: "credentialProfile" },
      { name: "protocols", dataType: ["string", "array"], typeCheck: true },
    ],
  },
  {
    kind: "datasource",
    typeName: "mqtt",
    profiles: SERVER_ONLY,
    fields: [
      { name: "brokerProfileId", dataType: "string", required: true, ref: "brokerProfile" },
      { name: "topic", dataType: "string", required: true },
      { name: "parser", dataType: "string", enum: ["json", "text"], coerce: "lower" },
      { name: "qos", dataType: "number", min: 0, max: 1 },
      { name: "keepaliveSeconds", dataType: "number", min: 5, max: 3600 },
    ],
  },
];

/** Look up a manifest entry by kind + type, or `undefined` if unknown. */
export const getManifestEntry = (
  kind: "datasource" | "widget",
  typeName: string,
): PluginManifestEntry | undefined =>
  PLUGIN_MANIFEST.find((entry) => entry.kind === kind && entry.typeName === typeName);

/**
 * Generous trust-boundary resource ceilings — DoS/abuse bounds, not product
 * limits. Document-wide totals (`maxWidgets` is across ALL panes); `maxNestingDepth`
 * is the deepest nested object/array. Enforced by the core validator; exposed here
 * so an external authoring client can discover them.
 */
export const RESOURCE_LIMITS = {
  maxDatasources: 200,
  maxPanes: 200,
  maxWidgets: 1000,
  maxNestingDepth: 32,
} as const;
