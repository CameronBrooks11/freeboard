import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createAuthToken } from "../src/auth.js";
import { setContext } from "../src/context.js";
import User from "../src/models/User.js";

const asLean = (value) => ({
  lean: async () => value,
});

const originalFindOne = User.findOne;

afterEach(() => {
  User.findOne = originalFindOne;
});

test("setContext hydrates authenticated user when sessionVersion matches", async () => {
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 2);

  User.findOne = ({ _id, active }) =>
    asLean(
      _id === "user-1" && active === true
        ? {
            _id: "user-1",
            email: "viewer@example.com",
            role: "viewer",
            active: true,
            sessionVersion: 2,
          }
        : null
    );

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.ok(context.user);
  assert.equal(context.user._id, "user-1");
  assert.equal(context.user.sessionVersion, 2);
});

test("setContext rejects stale JWT when sessionVersion no longer matches", async () => {
  const token = createAuthToken("viewer@example.com", "viewer", true, "user-1", 0);

  User.findOne = ({ _id, active }) =>
    asLean(
      _id === "user-1" && active === true
        ? {
            _id: "user-1",
            email: "viewer@example.com",
            role: "viewer",
            active: true,
            sessionVersion: 3,
          }
        : null
    );

  const context = await setContext({
    req: {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: "127.0.0.1" },
    },
  });

  assert.equal(context.user, undefined);
});

