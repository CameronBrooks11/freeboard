/**
 * @module dashboardRead
 * @description Initial dashboard read for the current route (by id or share token).
 */

import type { Ref } from "vue";
import { useQuery } from "@vue/apollo-composable";
import type { DASHBOARD_READ_QUERY } from "./gql.js";

type DashboardReadData = {
  dashboard?: Record<string, unknown> | null;
  dashboardByShareToken?: Record<string, unknown> | null;
};

/**
 * Run `document` with `variables` while `enabled` is true, always from the
 * network. Must be called inside a component setup or effect scope.
 */
export function useDashboardRead(
  document: typeof DASHBOARD_READ_QUERY,
  variables: () => Record<string, unknown>,
  enabled: Ref<boolean>,
) {
  const query = useQuery<DashboardReadData>(document, variables, {
    enabled,
    fetchPolicy: "network-only",
  });

  /**
   * Call `handler` with the data of each settled response, `undefined` when the
   * read failed. `result` cannot be used for this: every start after the first
   * resets it to `undefined` while the request is pending, and with Apollo
   * Client 4 a GraphQL error (not found, unauthorized) arrives as a result with
   * no data, which leaves `result` `undefined` and `error` null.
   */
  const onResponse = (handler: (data: DashboardReadData | undefined) => void) =>
    query.onResult((queryResult) => {
      if (!queryResult.loading) {
        handler(queryResult.data);
      }
    });

  return { loading: query.loading, error: query.error, onResponse };
}
