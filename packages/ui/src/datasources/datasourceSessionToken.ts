/**
 * @module datasources/datasourceSessionToken
 * @description GraphQL helper for minting short-lived datasource session tokens.
 */

const MINT_DATASOURCE_SESSION_TOKEN_MUTATION = `
mutation MintDatasourceSessionToken($dashboardId: ID!, $datasourceId: ID!, $shareToken: String) {
  mintDatasourceSessionToken(
    dashboardId: $dashboardId
    datasourceId: $datasourceId
    shareToken: $shareToken
  ) {
    token
    expiresAt
  }
}
`;

const decodeBase64 = (value: string): string => {
  const runtimeGlobal = globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding?: string): { toString(encoding?: string): string } };
  };
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  if (typeof runtimeGlobal.Buffer !== "undefined") {
    return runtimeGlobal.Buffer.from(value, "base64").toString("utf8");
  }
  return "";
};

const parseJwtPayload = (token: unknown): Record<string, unknown> | null => {
  if (!token || typeof token !== "string") {
    return null;
  }

  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    return null;
  }

  const normalizedBase64 = payloadSegment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");

  try {
    return JSON.parse(decodeBase64(normalizedBase64));
  } catch {
    return null;
  }
};

export const getDatasourceSessionTokenExpiry = (token: unknown): number | null => {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) {
    return null;
  }
  return exp * 1000;
};

/**
 * Mint a short-lived datasource runtime session token from the API.
 *
 * @param {{dashboardId: string, datasourceId: string, shareToken?: string|null, authToken?: string|null}} params
 * @returns {Promise<{token: string, expiresAt: string}>}
 */
export const mintDatasourceSessionToken = async ({
  dashboardId,
  datasourceId,
  shareToken = null,
  authToken = null,
}: {
  dashboardId: string;
  datasourceId: string;
  shareToken?: string | null;
  authToken?: string | null;
}): Promise<{ token: string; expiresAt: string }> => {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken
        ? {
            authorization: `Bearer ${authToken}`,
          }
        : {}),
    },
    body: JSON.stringify({
      query: MINT_DATASOURCE_SESSION_TOKEN_MUTATION,
      variables: {
        dashboardId,
        datasourceId,
        shareToken,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const graphQLError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  if (!response.ok || graphQLError) {
    throw new Error(
      graphQLError?.message || payload?.error || "Could not mint datasource session token",
    );
  }

  const tokenPayload =
    payload?.data &&
    typeof payload.data === "object" &&
    "mintDatasourceSessionToken" in payload.data
      ? (payload.data as { mintDatasourceSessionToken?: { token?: string; expiresAt?: string } })
          .mintDatasourceSessionToken
      : null;
  if (!tokenPayload?.token) {
    throw new Error("Datasource session token response is invalid");
  }

  return {
    token: tokenPayload.token,
    expiresAt: String(tokenPayload.expiresAt || ""),
  };
};
