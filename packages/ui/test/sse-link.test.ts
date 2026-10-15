import assert from "node:assert/strict";
import test from "node:test";

import { ApolloClient, InMemoryCache, gql } from "@apollo/client/core";
import type { Client, RequestParams } from "graphql-sse";

import { SSELink } from "../src/sse.js";

const DASHBOARD_SUBSCRIPTION = gql`
  subscription onDashboardUpdated($id: ID!) {
    dashboard(_id: $id) {
      _id
    }
  }
`;

test("SSELink sends only GraphQL-over-HTTP request parameters", async () => {
  const link = new SSELink({ url: "http://localhost/graphql" });
  const sent: RequestParams[] = [];
  link.client = {
    subscribe: (params: RequestParams, sink: { complete: () => void }) => {
      sent.push(params);
      sink.complete();
      return () => {};
    },
  } as unknown as Client;
  const client = new ApolloClient({ link, cache: new InMemoryCache() });

  // A real Apollo Client builds the Operation, so a field it adds in a later
  // version would reach the request body and fail here.
  await new Promise<void>((resolve, reject) => {
    client
      .subscribe({ query: DASHBOARD_SUBSCRIPTION, variables: { id: "dash-1" } })
      .subscribe({ complete: resolve, error: reject });
  });

  assert.equal(sent.length, 1);
  const params = sent[0]!;
  // The API rejects any other body parameter (Apollo Client 4's
  // `operationType`, for one) with HTTP 400.
  assert.deepEqual(Object.keys(params).sort(), [
    "extensions",
    "operationName",
    "query",
    "variables",
  ]);
  assert.equal(params.operationName, "onDashboardUpdated");
  assert.deepEqual(params.variables, { id: "dash-1" });
  assert.match(params.query, /subscription onDashboardUpdated/);
});
