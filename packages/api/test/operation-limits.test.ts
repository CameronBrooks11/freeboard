import assert from "node:assert/strict";
import test from "node:test";
import { getIntrospectionQuery, parse, validate } from "graphql";
import { createYoga } from "graphql-yoga";

import schema from "../src/gql.js";
import {
  MAX_OPERATION_ALIASES,
  MAX_OPERATION_DEPTH,
  MAX_OPERATION_NODES,
  operationLimitRules,
  useOperationLimits,
} from "../src/security/operationLimits.js";

// #204: bound query depth / alias count / total fields so one request can't
// amplify into an expensive operation. Calibrated against the REAL schema so the
// limits pass legitimate traffic (including introspection). Only the
// operation-limit rules run here, so synthetic field names are fine for the
// over-limit cases (field-existence is checked by other rules, not these).

const codes = (query: string) =>
  validate(schema, parse(query), operationLimitRules).map((error) => error.extensions?.code);

test("a normal nested dashboard query passes", () => {
  assert.deepEqual(
    codes(`
      query {
        dashboard(_id: "d1") {
          _id
          title
          canEdit
          document
        }
      }
    `),
    [],
  );
});

test("the standard introspection query passes (limits don't break GraphiQL)", () => {
  assert.deepEqual(codes(getIntrospectionQuery()), []);
});

test("a query deeper than the limit is rejected", () => {
  let selection = "leaf";
  for (let i = 0; i < MAX_OPERATION_DEPTH + 2; i += 1) {
    selection = `field${i} { ${selection} }`;
  }
  assert.ok(codes(`query { ${selection} }`).includes("OPERATION_TOO_DEEP"));
});

test("a query at the depth limit is allowed", () => {
  let selection = "leaf";
  // MAX_OPERATION_DEPTH levels of field nesting (root selection set = depth 1).
  for (let i = 0; i < MAX_OPERATION_DEPTH - 1; i += 1) {
    selection = `field${i} { ${selection} }`;
  }
  assert.deepEqual(codes(`query { ${selection} }`), []);
});

test("a query with too many aliases is rejected", () => {
  const aliased = Array.from(
    { length: MAX_OPERATION_ALIASES + 1 },
    (_, i) => `a${i}: __typename`,
  ).join(" ");
  assert.ok(codes(`query { ${aliased} }`).includes("OPERATION_TOO_MANY_ALIASES"));
});

test("a query with too many total fields is rejected", () => {
  const fields = Array.from({ length: MAX_OPERATION_NODES + 1 }, () => "__typename").join(" ");
  assert.ok(codes(`query { ${fields} }`).includes("OPERATION_TOO_LARGE"));
});

test("the plugin wires the rules into Yoga (rejected at validation, before execution)", async () => {
  // Inline instance so there are no server/DB side effects; an over-depth query
  // fails validation and never reaches a resolver.
  const yoga = createYoga({ schema, plugins: [useOperationLimits()] });
  let selection = "leaf";
  for (let i = 0; i < MAX_OPERATION_DEPTH + 2; i += 1) {
    selection = `f${i} { ${selection} }`;
  }
  const response = await yoga.fetch("http://localhost/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `query { ${selection} }` }),
  });
  const body = (await response.json()) as { errors?: Array<{ extensions?: { code?: string } }> };
  const errorCodes = (body.errors ?? []).map((error) => error.extensions?.code);
  assert.ok(errorCodes.includes("OPERATION_TOO_DEEP"), "expected the plugin to reject via Yoga");
});
