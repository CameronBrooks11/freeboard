/**
 * @module gateway/errors
 * @description Shared client-facing gateway error helpers.
 */

export const createClientError = (statusCode, message, streamErrorCode = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (streamErrorCode) {
    error.streamErrorCode = streamErrorCode;
  }
  return error;
};

export const writeError = (clientRes, error) => {
  const statusCode = Number(error?.statusCode) || 500;
  const message = statusCode >= 500 ? "Gateway request failed" : error?.message;
  if (!clientRes.headersSent) {
    clientRes.status(statusCode).json({ error: message || "Gateway request failed" });
  } else {
    clientRes.end();
  }
};
