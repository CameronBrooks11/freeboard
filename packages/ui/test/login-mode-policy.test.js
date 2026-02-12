import assert from "node:assert/strict";
import test from "node:test";

import {
  canAcceptInviteForMode,
  canCreateAccountForMode,
  LOGIN_ACTION_MODES,
  resolveLoginActionMode,
} from "../src/auth/loginMode.js";

test("canCreateAccountForMode only allows open mode", () => {
  assert.equal(canCreateAccountForMode("open"), true);
  assert.equal(canCreateAccountForMode("invite"), false);
  assert.equal(canCreateAccountForMode("disabled"), false);
});

test("canAcceptInviteForMode allows invite mode or explicit invite token", () => {
  assert.equal(
    canAcceptInviteForMode({ registrationMode: "invite", inviteToken: "" }),
    true
  );
  assert.equal(
    canAcceptInviteForMode({ registrationMode: "disabled", inviteToken: "token-123" }),
    true
  );
  assert.equal(
    canAcceptInviteForMode({ registrationMode: "open", inviteToken: "" }),
    false
  );
});

test("resolveLoginActionMode prioritizes reset token over invite token", () => {
  const mode = resolveLoginActionMode({
    registrationMode: "open",
    inviteToken: "invite-123",
    resetToken: "reset-123",
    currentMode: LOGIN_ACTION_MODES.login,
  });
  assert.equal(mode, LOGIN_ACTION_MODES.completeReset);
});

test("resolveLoginActionMode switches from register to login when mode no longer open", () => {
  const mode = resolveLoginActionMode({
    registrationMode: "disabled",
    inviteToken: "",
    resetToken: "",
    currentMode: LOGIN_ACTION_MODES.register,
  });
  assert.equal(mode, LOGIN_ACTION_MODES.login);
});

test("resolveLoginActionMode switches from invite to login when mode is no longer invite", () => {
  const mode = resolveLoginActionMode({
    registrationMode: "open",
    inviteToken: "",
    resetToken: "",
    currentMode: LOGIN_ACTION_MODES.invite,
  });
  assert.equal(mode, LOGIN_ACTION_MODES.login);
});

test("resolveLoginActionMode keeps current mode when still valid", () => {
  const mode = resolveLoginActionMode({
    registrationMode: "open",
    inviteToken: "",
    resetToken: "",
    currentMode: LOGIN_ACTION_MODES.login,
  });
  assert.equal(mode, LOGIN_ACTION_MODES.login);
});
