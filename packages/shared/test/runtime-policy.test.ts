import assert from "node:assert/strict";
import test from "node:test";

import {
  isNonDevRuntimeEnv,
  isWeakCredentialEncryptionKey,
  isWeakSharedSecret,
  normalizeRuntimeEnv,
  parseBase64Key,
} from "../src/runtimePolicy.js";

test("normalizeRuntimeEnv defaults to development and trims/lowercases values", () => {
  assert.equal(normalizeRuntimeEnv(undefined), "development");
  assert.equal(normalizeRuntimeEnv("  Staging "), "staging");
});

test("isNonDevRuntimeEnv only treats development and test as development runtimes", () => {
  assert.equal(isNonDevRuntimeEnv("development"), false);
  assert.equal(isNonDevRuntimeEnv("test"), false);
  assert.equal(isNonDevRuntimeEnv("staging"), true);
  assert.equal(isNonDevRuntimeEnv("qa"), true);
  assert.equal(isNonDevRuntimeEnv("production"), true);
});

test("isWeakSharedSecret rejects short and deterministic local-dev patterns", () => {
  assert.equal(isWeakSharedSecret("short-secret"), true);
  assert.equal(isWeakSharedSecret("freeboard-local-dev-jwt-secret-0123456789"), true);
  assert.equal(isWeakSharedSecret("freeboard-gateway-dev-insecure-local-only-secret-32"), true);
});

test("isWeakSharedSecret accepts strong random-like secrets", () => {
  assert.equal(isWeakSharedSecret("C_7a1N#2vK!9pR@4zX$6mQ%8wL&3tY*0"), false);
});

test("parseBase64Key returns null for invalid values and decodes fixed-length keys", () => {
  assert.equal(parseBase64Key("not-base64", 32), null);
  assert.equal(parseBase64Key(Buffer.alloc(16, 3).toString("base64"), 32), null);
  assert.equal(parseBase64Key(Buffer.alloc(32, 3).toString("base64"), 32)?.length, 32);
});

test("isWeakCredentialEncryptionKey rejects deterministic template and low-entropy keys", () => {
  assert.equal(isWeakCredentialEncryptionKey("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="), true);
  assert.equal(isWeakCredentialEncryptionKey(Buffer.alloc(32, 7).toString("base64")), true);
});

test("isWeakCredentialEncryptionKey accepts strong random-like key material", () => {
  const strongKey = Buffer.from(
    "4f9d2acb71e84c36a90f5e12d7b3c4aa5d61e8f90b2c47d38ea16f4bc9d2037f",
    "hex",
  ).toString("base64");
  assert.equal(isWeakCredentialEncryptionKey(strongKey), false);
});
