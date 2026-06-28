import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";

import { validateAuthToken } from "../src/auth.js";
import { dataStore } from "../src/data/index.js";
import { resetLoginThrottleState } from "../src/loginThrottle.js";
import UserResolvers from "../src/resolvers/User.js";

const policyRepository = dataStore.repositories.policy;
const userRepository = dataStore.repositories.users;
const inviteTokenRepository = dataStore.repositories.inviteTokens;
const auditRepository = dataStore.repositories.audit;

const originalMethods = {
  policyReadValue: policyRepository.readValue,
  userFindById: userRepository.findById,
  userFindByEmail: userRepository.findByEmail,
  userCountAll: userRepository.countAll,
  userUpdateById: userRepository.updateById,
  userCreate: userRepository.create,
  inviteFindActiveByTokenHash: inviteTokenRepository.findActiveByTokenHash,
  auditIsReady: auditRepository.isReady,
};

const buildUser = (overrides = {}) => ({
  _id: "user-1",
  email: "user@example.com",
  password: bcrypt.hashSync("StrongPass123!", 8),
  role: "viewer",
  active: true,
  sessionVersion: 0,
  registrationDate: new Date("2026-01-01T00:00:00.000Z"),
  lastLogin: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const stubPolicyValues = (overrides = {}) => {
  const defaults = {
    "auth.registration.mode": "disabled",
    "auth.registration.defaultRole": "viewer",
    "auth.publish.nonAdminCanPublish": false,
    "app.execution.mode": "safe",
    "dashboard.visibility.default": "private",
    "dashboard.listing.public.enabled": false,
  };
  const values = { ...defaults, ...overrides };

  policyRepository.readValue = async ({ key }) => values[key] ?? null;
};

afterEach(() => {
  policyRepository.readValue = originalMethods.policyReadValue;
  userRepository.findById = originalMethods.userFindById;
  userRepository.findByEmail = originalMethods.userFindByEmail;
  userRepository.countAll = originalMethods.userCountAll;
  userRepository.updateById = originalMethods.userUpdateById;
  userRepository.create = originalMethods.userCreate;
  inviteTokenRepository.findActiveByTokenHash = originalMethods.inviteFindActiveByTokenHash;
  auditRepository.isReady = originalMethods.auditIsReady;
  resetLoginThrottleState();
});

test("registerUser rejects when registration mode is disabled", async () => {
  stubPolicyValues({
    "auth.registration.mode": "disabled",
  });
  auditRepository.isReady = () => false;

  await assert.rejects(
    () =>
      UserResolvers.Mutation.registerUser(null, {
        email: "new.user@example.com",
        password: "StrongPass123!",
      }),
    /Self-registration is disabled/,
  );
});

test("registerUser rejects when registration mode requires invite", async () => {
  stubPolicyValues({
    "auth.registration.mode": "invite",
  });
  auditRepository.isReady = () => false;

  await assert.rejects(
    () =>
      UserResolvers.Mutation.registerUser(null, {
        email: "new.user@example.com",
        password: "StrongPass123!",
      }),
    /Invitation is required/,
  );
});

test("registerUser respects open mode and default role policy", async () => {
  stubPolicyValues({
    "auth.registration.mode": "open",
    "auth.registration.defaultRole": "editor",
  });
  auditRepository.isReady = () => false;

  let savedUser = null;
  userRepository.countAll = async () => 0;
  userRepository.findByEmail = async () => null;
  userRepository.create = async ({ email, role, active }) => {
    savedUser = buildUser({
      _id: "user-1",
      email,
      role,
      active,
    });
    return savedUser;
  };

  const result = await UserResolvers.Mutation.registerUser(null, {
    email: "Editor.User@Example.com",
    password: "StrongPass123!",
  });

  assert.ok(result.token);
  assert.equal(savedUser.email, "editor.user@example.com");
  assert.equal(savedUser.role, "editor");

  const payload = await validateAuthToken(result.token);
  assert.equal(payload.email, "editor.user@example.com");
  assert.equal(payload.role, "editor");
  assert.equal(payload.admin, false);
  assert.equal(payload.sv, 0);
});

test("authUser returns explicit deactivation message for inactive users", async () => {
  userRepository.findByEmail = async () =>
    buildUser({
      _id: "user-1",
      email: "inactive.user@example.com",
      active: false,
      password: bcrypt.hashSync("StrongPass123!", 8),
    });

  await assert.rejects(
    () =>
      UserResolvers.Mutation.authUser(null, {
        email: "inactive.user@example.com",
        password: "StrongPass123!",
      }),
    /deactivated/i,
  );
});

test("adminCreateInvite rejects non-admin context", async () => {
  await assert.rejects(
    () =>
      UserResolvers.Mutation.adminCreateInvite(
        null,
        {
          email: "invitee@example.com",
          role: "viewer",
          expiresInHours: 72,
        },
        {
          user: { _id: "editor-1", role: "editor", active: true },
        },
      ),
    /administrator/i,
  );
});

test("adminUpdateUser prevents self-demotion", async () => {
  userRepository.findById = async () =>
    buildUser({
      _id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      active: true,
    });

  await assert.rejects(
    () =>
      UserResolvers.Mutation.adminUpdateUser(
        null,
        {
          _id: "admin-1",
          role: "viewer",
        },
        {
          user: { _id: "admin-1", role: "admin", active: true },
        },
      ),
    /cannot demote themselves/i,
  );
});

test("acceptInvite rejects invalid or expired token", async () => {
  inviteTokenRepository.findActiveByTokenHash = async () => null;

  await assert.rejects(
    () =>
      UserResolvers.Mutation.acceptInvite(null, {
        token: "invalid-token",
        password: "StrongPass123!",
      }),
    /invalid or expired/i,
  );
});

test("adminUpdateUser increments sessionVersion when role or active changes", async () => {
  let updateParams = null;
  userRepository.findById = async ({ userId }) =>
    userId === "user-1"
      ? buildUser({
          _id: "user-1",
          email: "editor@example.com",
          role: "editor",
          active: true,
        })
      : null;
  userRepository.updateById = async (params) => {
    updateParams = params;
    return buildUser({
      _id: "user-1",
      email: "editor@example.com",
      role: "viewer",
      active: false,
      sessionVersion: 1,
    });
  };
  auditRepository.isReady = () => false;

  const result = await UserResolvers.Mutation.adminUpdateUser(
    null,
    { _id: "user-1", role: "viewer", active: false },
    { user: { _id: "admin-1", role: "admin", active: true } },
  );

  assert.deepEqual(updateParams, {
    userId: "user-1",
    patch: {
      role: "viewer",
      active: false,
    },
    incrementSessionVersion: true,
  });
  assert.equal(result.active, false);
  assert.equal(result.role, "viewer");
});

test("authUser throttles repeated failed login attempts", async () => {
  const passwordHash = bcrypt.hashSync("StrongPass123!", 8);
  userRepository.findByEmail = async () =>
    buildUser({
      _id: "user-1",
      email: "user@example.com",
      role: "viewer",
      active: true,
      sessionVersion: 0,
      password: passwordHash,
    });

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      () =>
        UserResolvers.Mutation.authUser(
          null,
          {
            email: "user@example.com",
            password: "wrong-pass",
          },
          {
            clientIp: "10.0.0.8",
          },
        ),
      /Invalid credentials/,
    );
  }

  await assert.rejects(
    () =>
      UserResolvers.Mutation.authUser(
        null,
        {
          email: "user@example.com",
          password: "wrong-pass",
        },
        {
          clientIp: "10.0.0.8",
        },
      ),
    /Too many login attempts/,
  );
});
