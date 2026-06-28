import assert from "node:assert/strict";
import test from "node:test";

import { enforcePublicCredentialPolicy } from "../src/datasourceGateway.js";

// Issue #221: the public datasource flow must not inject a non-`allowPublicUse`
// credential. The streaming protocols enforce this, but HTTP had no branch, so a
// public/link dashboard could use a non-public HTTP credential anonymously.

const publicClaims = { sub: "public" };
const authenticatedClaims = { sub: "user-1" };
const nonPublicCredential = { _id: "cred-1", allowPublicUse: false, secret: {} };
const publicCredential = { _id: "cred-2", allowPublicUse: true, secret: {} };

const enforce = (overrides = {}) =>
  enforcePublicCredentialPolicy({
    tokenClaims: publicClaims,
    credentialProfile: null,
    brokerProfile: null,
    protocol: "http",
    ...overrides,
  });

test("public flow: a non-public HTTP credential is rejected", () => {
  assert.throws(
    () => enforce({ credentialProfile: nonPublicCredential }),
    (error) => error.code === "CREDENTIAL_PUBLIC_FORBIDDEN" && error.statusCode === 403,
  );
});

test("public flow: an allowPublicUse HTTP credential is permitted", () => {
  assert.doesNotThrow(() => enforce({ credentialProfile: publicCredential }));
});

test("public flow: an HTTP datasource with no credential is permitted", () => {
  assert.doesNotThrow(() => enforce({ credentialProfile: null }));
});

test("authenticated flow is unaffected: a non-public HTTP credential is permitted", () => {
  assert.doesNotThrow(() =>
    enforce({ tokenClaims: authenticatedClaims, credentialProfile: nonPublicCredential }),
  );
});

test("regression: public flow still rejects a non-public sse/websocket credential", () => {
  for (const protocol of ["sse", "websocket"]) {
    assert.throws(
      () => enforce({ protocol, credentialProfile: nonPublicCredential }),
      (error) => error.code === "CREDENTIAL_PUBLIC_FORBIDDEN",
      `${protocol} must still be gated`,
    );
  }
});

test("regression: public flow still rejects a non-public mqtt broker", () => {
  assert.throws(
    () => enforce({ protocol: "mqtt", brokerProfile: { allowPublicUse: false } }),
    (error) => error.code === "BROKER_PUBLIC_FORBIDDEN",
  );
});
