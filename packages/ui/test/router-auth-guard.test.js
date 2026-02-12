import assert from "node:assert/strict";
import test from "node:test";

import {
  isAuthEntryRoute,
  resolveAuthNavigation,
  resolveNavigationGuard,
} from "../src/router/authGuard.js";

test("isAuthEntryRoute recognizes login/invite/reset entry points", () => {
  assert.equal(isAuthEntryRoute("Login"), true);
  assert.equal(isAuthEntryRoute("InviteAccept"), true);
  assert.equal(isAuthEntryRoute("PasswordReset"), true);
  assert.equal(isAuthEntryRoute("Home"), false);
});

test("resolveAuthNavigation redirects unauthenticated users away from protected routes", () => {
  const redirect = resolveAuthNavigation({
    routeName: "Home",
    isLoggedIn: false,
    isAdmin: false,
  });
  assert.deepEqual(redirect, { name: "Login" });
});

test("resolveAuthNavigation redirects authenticated users away from auth-entry routes", () => {
  const redirect = resolveAuthNavigation({
    routeName: "Login",
    isLoggedIn: true,
    isAdmin: false,
  });
  assert.deepEqual(redirect, { name: "Home" });
});

test("resolveAuthNavigation enforces admin-only routes", () => {
  const nonAdminRedirect = resolveAuthNavigation({
    routeName: "Admin",
    requiresAdmin: true,
    isLoggedIn: true,
    isAdmin: false,
  });
  assert.deepEqual(nonAdminRedirect, { name: "Home" });

  const adminRedirect = resolveAuthNavigation({
    routeName: "Admin",
    requiresAdmin: true,
    isLoggedIn: true,
    isAdmin: true,
  });
  assert.equal(adminRedirect, null);
});

test("resolveNavigationGuard adapts route object inputs", () => {
  const redirect = resolveNavigationGuard({
    to: { name: "Admin", meta: { requiresAdmin: true } },
    isLoggedIn: true,
    isAdmin: false,
  });
  assert.deepEqual(redirect, { name: "Home" });
});
