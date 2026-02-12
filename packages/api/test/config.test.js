import assert from "node:assert/strict";
import { test } from "node:test";

const CONFIG_ENV_KEYS = [
  "NODE_ENV",
  "JWT_SECRET",
  "CREATE_ADMIN",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "MONGO_URL",
  "PORT",
  "AUTH_REGISTRATION_MODE",
  "AUTH_REGISTRATION_DEFAULT_ROLE",
  "AUTH_EDITOR_CAN_PUBLISH",
  "EXECUTION_MODE",
  "POLICY_EDIT_LOCK",
];

const withEnv = async (overrides, run) => {
  const original = Object.fromEntries(
    CONFIG_ENV_KEYS.map((key) => [key, process.env[key]])
  );

  for (const key of CONFIG_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  try {
    await run();
  } finally {
    for (const key of CONFIG_ENV_KEYS) {
      const value = original[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const importConfigFresh = async () =>
  import(`../src/config.js?case=${Date.now()}-${Math.random()}`);

test("config rejects weak JWT secret in non-development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "short-secret",
      CREATE_ADMIN: "false",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "StrongPass123!",
      MONGO_URL: "mongodb://127.0.0.1:27017/freeboard",
      PORT: "4001",
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /JWT_SECRET is missing or too weak/
      );
    }
  );
});

test("config rejects invalid admin email when CREATE_ADMIN=true", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "true",
      ADMIN_EMAIL: "invalid-email",
      ADMIN_PASSWORD: "StrongPass123!",
      MONGO_URL: "mongodb://127.0.0.1:27017/freeboard",
      PORT: "4001",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /valid ADMIN_EMAIL/);
    }
  );
});

test("config rejects weak admin password when CREATE_ADMIN=true", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "true",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "weakpass",
      MONGO_URL: "mongodb://127.0.0.1:27017/freeboard",
      PORT: "4001",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /strong ADMIN_PASSWORD/);
    }
  );
});

test("config accepts valid CREATE_ADMIN credentials and normalizes email", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "true",
      ADMIN_EMAIL: "  Admin@Example.com ",
      ADMIN_PASSWORD: "StrongPass123!",
      MONGO_URL: "mongodb://127.0.0.1:27017/freeboard",
      PORT: "4001",
    },
    async () => {
      const { config } = await importConfigFresh();
      assert.equal(config.createAdmin, true);
      assert.equal(config.adminEmail, "admin@example.com");
    }
  );
});

test("config rejects unsupported registration mode", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      AUTH_REGISTRATION_MODE: "invalid-mode",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /Invalid registration mode/);
    }
  );
});

test("config rejects unsupported registration default role", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      AUTH_REGISTRATION_MODE: "open",
      AUTH_REGISTRATION_DEFAULT_ROLE: "admin",
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /Invalid non-admin role/
      );
    }
  );
});

test("config accepts valid auth policy environment overrides", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      AUTH_REGISTRATION_MODE: "open",
      AUTH_REGISTRATION_DEFAULT_ROLE: "editor",
      AUTH_EDITOR_CAN_PUBLISH: "true",
      EXECUTION_MODE: "trusted",
      POLICY_EDIT_LOCK: "true",
    },
    async () => {
      const { config } = await importConfigFresh();
      assert.equal(config.registrationMode, "open");
      assert.equal(config.registrationDefaultRole, "editor");
      assert.equal(config.editorCanPublish, true);
      assert.equal(config.executionMode, "trusted");
      assert.equal(config.policyEditLock, true);
    }
  );
});

test("config rejects unsupported execution mode", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      EXECUTION_MODE: "unsafe",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /Invalid execution mode/);
    }
  );
});
