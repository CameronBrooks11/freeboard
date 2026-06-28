/**
 * @module security/requestBodyLimit
 * A true (streamed) request-body size cap for the GraphQL endpoint.
 *
 * The `Content-Length` header check is only a fast pre-reject: a chunked request
 * omits that header and slips past it. This enforces the cap on the actual bytes
 * received. It reads the body with async iteration (NOT `req.on("data")`, which
 * would flip the stream to flowing mode and race graphql-yoga's own body read)
 * and stashes the PARSED body on `req.body` — the pre-parsed-body path that
 * `@whatwg-node/server` consumes directly, so Yoga never touches the raw stream.
 * (Parsed, not raw: whatwg-node gates that path on `Object.keys(req.body).length`,
 * which is O(1) for a `{query, variables}` object but O(n) over every byte index
 * for a Buffer/string — a multi-hundred-ms event-loop stall near the cap.)
 *
 * GET/HEAD requests (including SSE subscriptions, which carry no request body)
 * pass through untouched, so the streaming subscription path is unaffected.
 */

import type { IncomingMessage, ServerResponse } from "http";

/** Outer ceiling for the GraphQL endpoint body. Generous; nginx/internal caps are tighter. */
export const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class RequestBodyTooLargeError extends Error {
  readonly statusCode = 413;
  constructor() {
    super("Request body too large");
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Buffer an async byte stream, throwing `RequestBodyTooLargeError` as soon as the
 * cumulative size exceeds `maxBytes` (so an oversized body is rejected mid-stream,
 * not after fully buffering it).
 */
export const readCappedRawBody = async (
  stream: AsyncIterable<Buffer | string>,
  maxBytes: number,
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
};

const sendError = (res: ServerResponse, statusCode: number, message: string): void => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ errors: [{ message }] }));
};

/**
 * Enforce the streamed body cap for a GraphQL request. For body-bearing methods,
 * buffers the body (capped), parses it, and stashes the parsed value on `req.body`
 * for Yoga to consume. GET/HEAD pass through. Returns `true` if the request may
 * proceed to Yoga, or `false` if it was rejected (a response has already been sent).
 */
export const enforceRequestBodyLimit = async (
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number = MAX_REQUEST_BODY_BYTES,
): Promise<boolean> => {
  if (!BODY_METHODS.has(String(req.method || "").toUpperCase())) {
    return true;
  }

  let raw: Buffer;
  try {
    raw = await readCappedRawBody(req, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendError(res, 413, "Request body too large");
      return false;
    }
    // Stream error (e.g. the client aborted mid-upload).
    if (!res.headersSent) {
      sendError(res, 400, "Invalid request body");
    }
    return false;
  }

  if (raw.length === 0) {
    // No body: leave `req.body` unset and let Yoga see the (now-drained) request —
    // an empty POST is its own GraphQL error.
    return true;
  }

  // Stash the PARSED body, not the raw bytes. @whatwg-node/server gates its
  // pre-parsed-body path on `Object.keys(req.body).length`, which is O(1) for a
  // parsed object but O(n) over every byte index for a Buffer/string. The endpoint
  // only ever receives JSON (UI + graphql-sse both send application/json), so a
  // non-JSON body is rejected here rather than forwarded.
  try {
    (req as IncomingMessage & { body?: unknown }).body = JSON.parse(raw.toString("utf8"));
  } catch {
    sendError(res, 400, "Invalid JSON payload");
    return false;
  }
  return true;
};
