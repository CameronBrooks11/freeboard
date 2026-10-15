import assert from "node:assert/strict";
import test from "node:test";

import { ApolloClient, ApolloLink, InMemoryCache, Observable } from "@apollo/client";
import { provideApolloClient, useMutation } from "@vue/apollo-composable";
import { createI18n } from "vue-i18n";

import { classifyDashboardSaveError } from "../src/dashboardSaveError.js";
import { DASHBOARD_UPDATE_MUTATION } from "../src/gql.js";
import { UI_LOCALE_MESSAGES } from "../src/i18n/catalog.js";

type ServerError = { message: string; extensions?: Record<string, unknown> };

/**
 * Reject an update save the way the app does: the composable's real
 * `useMutation` over an Apollo Client 4 whose link answers with these
 * GraphQL errors. Returns what `mutate()` rejected with.
 */
const rejectedSave = async (errors: ServerError[]): Promise<unknown> => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      () =>
        new Observable((observer) => {
          observer.next({ errors });
          observer.complete();
        }),
    ),
  });
  const { mutate } = provideApolloClient(client)(() => useMutation(DASHBOARD_UPDATE_MUTATION));
  try {
    await mutate({ id: "dash-1", dashboard: { document: {}, expectedDocumentRevision: 1 } });
  } catch (error) {
    return error;
  }
  assert.fail("expected the save mutation to reject");
};

test("the composable hides the server errors from an Apollo 3 graphQLErrors read", async () => {
  const error = (await rejectedSave([
    { message: "Dashboard was changed", extensions: { code: "CONFLICT" } },
  ])) as { graphQLErrors?: unknown; networkError?: unknown };
  assert.deepEqual(error.graphQLErrors, []);
  assert.ok(error.networkError);
});

test("a stale-revision save classifies as a conflict", async () => {
  const error = await rejectedSave([
    {
      message: "Dashboard was changed since you loaded it. Reload to get the latest version.",
      extensions: { code: "CONFLICT", currentRevision: 3 },
    },
  ]);
  assert.deepEqual(classifyDashboardSaveError(error), { kind: "conflict" });
});

test("a codeless Dashboard not found classifies as lost access", async () => {
  const error = await rejectedSave([{ message: "Dashboard not found" }]);
  assert.deepEqual(classifyDashboardSaveError(error), { kind: "accessLost" });
});

test("a BAD_USER_INPUT save carries the server's message and validation issues", async () => {
  const error = await rejectedSave([
    {
      message: "Dashboard document failed validation",
      extensions: {
        code: "BAD_USER_INPUT",
        validationErrors: [
          {
            code: "schema.maximum",
            path: "/datasources/0/settings/keepaliveSeconds",
            message: "must be <= 3600",
          },
        ],
      },
    },
  ]);
  assert.deepEqual(classifyDashboardSaveError(error), {
    kind: "rejected",
    message:
      "Dashboard document failed validation\nmust be <= 3600 (/datasources/0/settings/keepaliveSeconds)",
  });
});

test("a FORBIDDEN save carries the server's message", async () => {
  const error = await rejectedSave([
    {
      message: "Trusted dashboard settings require execution mode 'trusted'",
      extensions: { code: "FORBIDDEN" },
    },
  ]);
  assert.deepEqual(classifyDashboardSaveError(error), {
    kind: "rejected",
    message: "Trusted dashboard settings require execution mode 'trusted'",
  });
});

test("a conflict outranks a FORBIDDEN in the same rejection", async () => {
  const error = await rejectedSave([
    { message: "Only administrators can publish dashboards", extensions: { code: "FORBIDDEN" } },
    { message: "Dashboard was changed", extensions: { code: "CONFLICT" } },
  ]);
  assert.deepEqual(classifyDashboardSaveError(error), { kind: "conflict" });
});

test("other coded rejections and non-GraphQL errors are left to rethrow", async () => {
  const unauthenticated = await rejectedSave([
    {
      message: "You must be authenticated to perform this action",
      extensions: { code: "UNAUTHENTICATED" },
    },
  ]);
  assert.equal(classifyDashboardSaveError(unauthenticated), null);
  assert.equal(
    classifyDashboardSaveError(new Error("You do not have permission to edit this dashboard.")),
    null,
  );
  assert.equal(classifyDashboardSaveError(undefined), null);
});

test("every UI locale renders the rejection alert with the server's message", () => {
  const i18n = createI18n({ legacy: false, locale: "en", messages: UI_LOCALE_MESSAGES });
  for (const locale of Object.keys(UI_LOCALE_MESSAGES)) {
    const text = i18n.global.t(
      "dashboard.saveRejected",
      { message: "must be <= 3600" },
      { locale },
    );
    assert.notEqual(text, "dashboard.saveRejected", locale);
    assert.ok(text.endsWith("\nmust be <= 3600"), `${locale}: ${text}`);
  }
});
