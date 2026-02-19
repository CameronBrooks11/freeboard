/**
 * @module sse
 * @description ApolloLink implementation using Server-Sent Events (SSE) for GraphQL subscriptions.
 */

import { ApolloLink, Observable } from "@apollo/client/core";
import { print } from "graphql";
import { createClient } from "graphql-sse";
import type { Client, ClientOptions } from "graphql-sse";
import type { Operation, FetchResult } from "@apollo/client/core";

/**
 * ApolloLink subclass that uses SSE (via graphql-sse) for GraphQL subscriptions.
 */
export class SSELink extends ApolloLink {
  /** @type {import('graphql-sse').Client} Underlying SSE client instance */
  client: Client;

  /**
   * Initialize the SSELink.
   *
   * @param {object} options - Configuration options for graphql-sse createClient.
   * @param {string} options.url - GraphQL endpoint URL for SSE.
   * @param {function(): Record<string, string>} [options.headers] - Function returning headers for each request.
   */
  constructor(options: ClientOptions) {
    super();
    this.client = createClient(options);
  }

  /**
   * Execute a GraphQL operation via SSE and return an Observable.
   *
   * @param {import('@apollo/client').Operation} operation - GraphQL operation with query and variables.
   * @returns {import('@apollo/client').Observable<any>} Observable emitting subscription results.
   */
  request(operation: Operation): Observable<FetchResult> {
    return new Observable<FetchResult>((sink) => {
      return this.client.subscribe(
        { ...operation, query: print(operation.query) },
        {
          next: sink.next.bind(sink),
          complete: sink.complete.bind(sink),
          error: sink.error.bind(sink),
        },
      );
    });
  }
}
