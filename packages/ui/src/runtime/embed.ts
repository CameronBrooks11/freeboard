/**
 * @module runtime/embed
 * @description Local-first (Lite) embedding contract: the cross-origin
 * document-injection channel. An embedder posts a portable DashboardDocument to
 * the iframe via `postMessage`; the receiver validates the message envelope and
 * the sender origin before the document is funnelled through the normal
 * validate+migrate load path. Same-origin embedders may instead seed
 * `localStorage` (see the Lite local-persistence path).
 */

const importMetaEnv: Record<string, unknown> =
  typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

/** The `postMessage` envelope `type` an embedder must send to inject a document. */
export const EMBED_DOCUMENT_MESSAGE_TYPE = "freeboard:load-document";

const readAllowedOrigins = (): string[] => {
  const raw = importMetaEnv.VITE_FREEBOARD_EMBED_ALLOWED_ORIGINS;
  return typeof raw === "string"
    ? raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
};

/**
 * Origins allowed to inject documents via `postMessage`, from the build-time
 * `VITE_FREEBOARD_EMBED_ALLOWED_ORIGINS` (comma-separated). Empty = accept any
 * (the injected document is still validated and runs in safe execution mode);
 * `*` also accepts any.
 */
export const EMBED_ALLOWED_ORIGINS = readAllowedOrigins();

/** Whether `origin` may inject a document given the configured allowlist. */
export const isEmbedOriginAllowed = (
  origin: string,
  allowedOrigins: string[] = EMBED_ALLOWED_ORIGINS,
): boolean =>
  allowedOrigins.length === 0 || allowedOrigins.includes("*") || allowedOrigins.includes(origin);

/**
 * Parse a `postMessage` payload into the embed document envelope, or null if it
 * is not a well-formed `freeboard:load-document` message.
 */
export const parseEmbedDocumentMessage = (data: unknown): { document: unknown } | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const envelope = data as Record<string, unknown>;
  if (envelope.type !== EMBED_DOCUMENT_MESSAGE_TYPE) {
    return null;
  }
  return { document: envelope.document };
};
