import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";

import { validateAuthToken } from "../src/auth.js";
import InviteToken from "../src/models/InviteToken.js";
import Policy from "../src/models/Policy.js";
import User from "../src/models/User.js";
import UserResolvers from "../src/resolvers/User.js";
import { resetLoginThrottleState } from "../src/loginThrottle.js";

const asLean = (value) => ({
  lean: async () => value,
});

const originalMethods = {
  policyFindOne: Policy.findOne,
  userFindOne: User.findOne,
  userEstimateCount: User.estimatedDocumentCount,
  userCountDocuments: User.countDocuments,
  userFindOneAndUpdate: User.findOneAndUpdate,
  userPrototypeSave: User.prototype.save,
  inviteFindOne: InviteToken.findOne,
};

const stubPolicyValues = (overrides = {}) => {
  const defaults = {
    "auth.registration.mode": "disabled",
    "auth.registration.defaultRole": "viewer",
    "auth.publish.editorCanPublish": false,
    "app.execution.mode": "safe",
  };
  const values = { ...defaults, ...overrides };

  Policy.findOne = ({ key }) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      return asLean(null);
    }
    return asLean({ key, value: values[key] });
  };
};

afterEach(() => {
  Policy.findOne = originalMethods.policyFindOne;
  User.findOne = originalMethods.userFindOne;
  User.estimatedDocumentCount = originalMethods.userEstimateCount;
  User.countDocuments = originalMethods.userCountDocuments;
  User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
  User.prototype.save = originalMethods.userPrototypeSave;
  InviteToken.findOne = originalMethods.inviteFindOne;
  resetLoginThrottleState();
});

test("registerUser rejects when registration mode is disabled", async () => {
  stubPolicyValues({
    "auth.registration.mode": "disabled",
  });

  await assert.rejects(
    () =>
      UserResolvers.Mutation.registerUser(null, {
        email: "new.user@example.com",
        password: "StrongPass123!",
      }),
    /Self-registration is disabled/
  );
});

test("registerUser rejects when registration mode requires invite", async () => {
  stubPolicyValues({
    "auth.registration.mode": "invite",
  });

  await assert.rejects(
    () =>
      UserResolvers.Mutation.registerUser(null, {
        email: "new.user@example.com",
        password: "StrongPass123!",
      }),
    /Invitation is required/
  );
});

test("registerUser respects open mode and default role policy", async () => {
  stubPolicyValues({
    "auth.registration.mode": "open",
    "auth.registration.defaultRole": "editor",
  });

  let savedUser = null;
  User.estimatedDocumentCount = async () => 0;
  User.findOne = (filter) => {
    if (filter.email) {
      return asLean(null);
    }
    if (filter._id === "user-1") {
      return asLean(savedUser);
    }
    return asLean(null);
  };
  User.prototype.save = async function saveStub() {
    savedUser = {
      _id: "user-1",
      email: this.email,
      role: this.role,
      active: this.active,
    };
    return { _id: "user-1" };
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
  User.findOne = () =>
    asLean({
      _id: "user-1",
      email: "inactive.user@example.com",
      role: "viewer",
      active: false,
      password: bcrypt.hashSync("StrongPass123!", 8),
    });

  await assert.rejects(
    () =>
      UserResolvers.Mutation.authUser(null, {
        email: "inactive.user@example.com",
        password: "StrongPass123!",
      }),
    /deactivated/i
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
        }
      ),
    /administrator/i
  );
});

test("adminUpdateUser prevents self-demotion", async () => {
  User.findOne = () =>
    asLean({
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
        }
      ),
    /cannot demote themselves/i
  );
});

test("acceptInvite rejects invalid or expired token", async () => {
  InviteToken.findOne = () => asLean(null);

  await assert.rejects(
    () =>
      UserResolvers.Mutation.acceptInvite(null, {
        token: "invalid-token",
        password: "StrongPass123!",
      }),
    /invalid or expired/i
  );
});

test("adminUpdateUser increments sessionVersion when role or active changes", async () => {
  let updatePayload = null;
  User.findOne = ({ _id }) =>
    asLean(
      _id === "user-1"
        ? {
            _id: "user-1",
            email: "editor@example.com",
            role: "editor",
            active: true,
          }
        : null
    );
  User.findOneAndUpdate = (filter, update) => {
    assert.deepEqual(filter, { _id: "user-1" });
    updatePayload = update;
    return asLean({
      _id: "user-1",
      email: "editor@example.com",
      role: "viewer",
      active: false,
      sessionVersion: 1,
    });
  };

  const result = await UserResolvers.Mutation.adminUpdateUser(
    null,
    { _id: "user-1", role: "viewer", active: false },
    { user: { _id: "admin-1", role: "admin", active: true } }
  );

  assert.deepEqual(updatePayload, {
    $set: {
      role: "viewer",
      active: false,
    },
    $inc: { sessionVersion: 1 },
  });
  assert.equal(result.active, false);
  assert.equal(result.role, "viewer");
});

test("authUser throttles repeated failed login attempts", async () => {
  const passwordHash = bcrypt.hashSync("StrongPass123!", 8);
  User.findOne = () =>
    asLean({
      _id: "user-1",
      email: "user@example.com",
      role: "viewer",
      active: true,
      sessionVersion: 0,
      password: passwordHash,
    });
  User.findOneAndUpdate = () => asLean(null);

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
          }
        ),
      /Invalid credentials/
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
        }
      ),
    /Too many login attempts/
  );
});
