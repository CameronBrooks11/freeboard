import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptCredentialSecret,
  encryptCredentialSecret,
  redactSecretShape,
} from "../src/credentialEncryption.js";

test("encryptCredentialSecret/decryptCredentialSecret round-trip secret payload", () => {
  const source = {
    token: "secret-token",
    username: "device-user",
    password: "device-password",
  };

  const encrypted = encryptCredentialSecret(source);
  assert.equal(encrypted.algorithm, "aes-256-gcm");
  assert.equal(typeof encrypted.iv, "string");
  assert.equal(typeof encrypted.ciphertext, "string");
  assert.equal(typeof encrypted.authTag, "string");

  const decrypted = decryptCredentialSecret(encrypted);
  assert.deepEqual(decrypted, source);
});

test("redactSecretShape returns masked shape without leaking values", () => {
  const redacted = redactSecretShape({
    token: "sensitive",
    headerValue: "another-sensitive-value",
  });

  assert.deepEqual(redacted, {
    token: "***",
    headerValue: "***",
  });
});

test("decryptCredentialSecret rejects malformed encrypted payload", () => {
  assert.throws(
    () =>
      decryptCredentialSecret({
        algorithm: "aes-256-gcm",
        iv: "not-base64",
        ciphertext: "bad",
      }),
    /invalid/i
  );
});
