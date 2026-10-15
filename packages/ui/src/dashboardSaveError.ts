import { CombinedGraphQLErrors } from "@apollo/client";

type SaveGraphQLError = {
  message?: unknown;
  extensions?: { code?: unknown; validationErrors?: unknown };
};

/** How a rejected dashboard save should be reported; null means rethrow. */
export type DashboardSaveFailure =
  { kind: "conflict" } | { kind: "accessLost" } | { kind: "rejected"; message: string } | null;

/**
 * The GraphQL errors behind a rejected save. `@vue/apollo-composable` 4 bundles
 * Apollo Client 3, whose `toApolloError` does not recognise the Apollo 4
 * `CombinedGraphQLErrors` the UI's client rejects with: it wraps it as an
 * Apollo 3 `ApolloError` with `graphQLErrors: []` and the original as
 * `networkError`. Read the errors from there, from a direct
 * `CombinedGraphQLErrors`, or from a populated Apollo 3 `graphQLErrors`.
 */
export const graphQLErrorsOf = (error: unknown): readonly SaveGraphQLError[] => {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors;
  }
  const wrapped = error as { graphQLErrors?: unknown; networkError?: unknown } | null | undefined;
  if (Array.isArray(wrapped?.graphQLErrors) && wrapped.graphQLErrors.length > 0) {
    return wrapped.graphQLErrors as SaveGraphQLError[];
  }
  if (CombinedGraphQLErrors.is(wrapped?.networkError)) {
    return wrapped.networkError.errors;
  }
  return [];
};

const codeOf = (entry: SaveGraphQLError | undefined): unknown => entry?.extensions?.code;

/** Codes whose message explains the rejection to the user. */
const REJECTION_CODES = new Set<unknown>(["BAD_USER_INPUT", "FORBIDDEN"]);

/**
 * The server's explanation of a rejection: each error message, followed by
 * any document validation issues as `message (path)`.
 */
const rejectionMessageOf = (entries: readonly SaveGraphQLError[]): string => {
  const lines: string[] = [];
  for (const entry of entries) {
    if (typeof entry.message === "string" && entry.message) {
      lines.push(entry.message);
    }
    const issues = entry.extensions?.validationErrors;
    if (!Array.isArray(issues)) {
      continue;
    }
    for (const issue of issues as Array<{ message?: unknown; path?: unknown }>) {
      if (typeof issue?.message !== "string" || !issue.message) {
        continue;
      }
      lines.push(
        typeof issue.path === "string" && issue.path
          ? `${issue.message} (${issue.path})`
          : issue.message,
      );
    }
  }
  return lines.join("\n");
};

/**
 * Classify a rejected dashboard save:
 * - CONFLICT: the document advanced elsewhere since it was loaded.
 * - BAD_USER_INPUT or FORBIDDEN: the server rejected the input or a setting
 *   the user may not save; carries its explanation.
 * - Only codeless errors: the access checks throw a codeless "Dashboard not
 *   found" when the dashboard is gone or access was lost (conflated for privacy).
 * Anything else (UNAUTHENTICATED, other codes, network or client errors)
 * returns null.
 */
export const classifyDashboardSaveError = (error: unknown): DashboardSaveFailure => {
  const errors = graphQLErrorsOf(error);
  if (errors.length === 0) {
    return null;
  }
  if (errors.some((entry) => codeOf(entry) === "CONFLICT")) {
    return { kind: "conflict" };
  }
  const rejected = errors.filter((entry) => REJECTION_CODES.has(codeOf(entry)));
  if (rejected.length > 0) {
    return { kind: "rejected", message: rejectionMessageOf(rejected) };
  }
  if (errors.every((entry) => !codeOf(entry))) {
    return { kind: "accessLost" };
  }
  return null;
};
