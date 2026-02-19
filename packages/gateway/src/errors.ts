/**
 * @module gateway/errors
 * @description Shared client-facing gateway error helpers.
 */

export const createClientError = (
  statusCode: number,
  message: string,
  streamErrorCode: string | null = null,
) => {
  const error = new Error(message) as Error & {
    statusCode?: number;
    streamErrorCode?: string;
  };
  error.statusCode = statusCode;
  if (streamErrorCode) {
    error.streamErrorCode = streamErrorCode;
  }
  return error;
};

type ErrorResponse = {
  headersSent: boolean;
  status: (statusCode: number) => { json: (payload: { error: string }) => void };
  end: () => void;
};

type ErrorLike = {
  statusCode?: number;
  message?: string;
};

export const writeError = (clientRes: ErrorResponse, error: unknown): void => {
  const normalizedError =
    error && typeof error === "object" ? (error as ErrorLike) : ({} as ErrorLike);
  const statusCode = Number(normalizedError.statusCode) || 500;
  const message = statusCode >= 500 ? "Gateway request failed" : normalizedError.message;
  if (!clientRes.headersSent) {
    clientRes.status(statusCode).json({ error: message || "Gateway request failed" });
  } else {
    clientRes.end();
  }
};
