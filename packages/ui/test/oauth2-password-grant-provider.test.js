import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { OAuth2PasswordGrantProvider } from "../src/auth/OAuth2PasswordGrantProvider.js";

const baseSettings = {
  url: "https://auth.example/token",
  client_id: "client-id",
  client_secret: "client-secret",
  username: "alice@example.com",
  password: "secret-pass",
};

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test("OAuth2 provider reuses still-valid token without network call", async () => {
  const provider = new OAuth2PasswordGrantProvider(baseSettings);
  provider.tokenProperties = {
    access_token: "cached-token",
    refresh_token: "refresh-token",
    expires_at: new Date(Date.now() + 60_000),
  };

  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called");
  };

  const token = await provider.getAccessToken();
  assert.equal(token, "cached-token");
  assert.equal(fetchCalls, 0);
});

test("OAuth2 provider uses refresh_token flow when token is expired", async () => {
  const provider = new OAuth2PasswordGrantProvider(baseSettings);
  provider.tokenProperties = {
    access_token: "expired-token",
    refresh_token: "refresh-token",
    expires_at: new Date(Date.now() - 1_000),
  };

  let receivedBody = null;
  global.fetch = async (_url, options) => {
    receivedBody = options.body;
    return {
      json: async () => ({
        access_token: "refreshed-token",
        expires_in: 120,
      }),
    };
  };

  const token = await provider.getAccessToken();
  assert.equal(token, "refreshed-token");
  assert.equal(receivedBody.get("grant_type"), "refresh_token");
  assert.equal(receivedBody.get("refresh_token"), "refresh-token");
});

test("OAuth2 provider falls back to password grant when no refresh token exists", async () => {
  const provider = new OAuth2PasswordGrantProvider(baseSettings);
  provider.tokenProperties = {
    access_token: "expired-token",
    expires_at: new Date(Date.now() - 1_000),
  };

  let receivedBody = null;
  global.fetch = async (_url, options) => {
    receivedBody = options.body;
    return {
      json: async () => ({
        access_token: "password-grant-token",
        expires_in: 60,
      }),
    };
  };

  const token = await provider.getAccessToken();
  assert.equal(token, "password-grant-token");
  assert.equal(receivedBody.get("grant_type"), "password");
  assert.equal(receivedBody.get("client_id"), "client-id");
  assert.equal(receivedBody.get("username"), "alice@example.com");
});

