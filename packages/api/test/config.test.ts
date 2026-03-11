import assert from "node:assert/strict";
import { test } from "node:test";

const CONFIG_ENV_KEYS = [
  "NODE_ENV",
  "DB_BACKEND",
  "JWT_SECRET",
  "CREATE_ADMIN",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "DATABASE_URL",
  "FREEBOARD_POSTGRES_URL",
  "POSTGRES_CONNECT_TIMEOUT_MS",
  "POSTGRES_POOL_MAX_CONNECTIONS",
  "POSTGRES_POOL_MAX",
  "POSTGRES_POOL_IDLE_TIMEOUT_MS",
  "POSTGRES_SSL_MODE",
  "PORT",
  "AUTH_REGISTRATION_MODE",
  "AUTH_REGISTRATION_DEFAULT_ROLE",
  "AUTH_EDITOR_CAN_PUBLISH",
  "DASHBOARD_DEFAULT_VISIBILITY",
  "DASHBOARD_PUBLIC_LISTING_ENABLED",
  "EXECUTION_MODE",
  "POLICY_EDIT_LOCK",
  "AUTH_LOGIN_MAX_ATTEMPTS",
  "AUTH_LOGIN_WINDOW_SECONDS",
  "AUTH_LOGIN_LOCK_SECONDS",
  "SECURITY_LIMITER_BACKEND",
  "SECURITY_LIMITER_FAILURE_MODE",
  "SECURITY_LIMITER_NAMESPACE",
  "SECURITY_LIMITER_HASH_SALT",
  "SECURITY_LIMITER_MEMORY_MAX_KEYS",
  "JWT_GATEWAY_SECRET",
  "GATEWAY_SERVICE_TOKEN",
  "CREDENTIAL_ENCRYPTION_KEY",
  "FETCH_TIMEOUT_MS",
  "FETCH_MAX_RESPONSE_BYTES",
  "DATASOURCE_TOKEN_MINT_RATE_LIMIT_USER_PER_MIN",
  "DATASOURCE_TOKEN_MINT_RATE_LIMIT_PUBLIC_IP_PER_MIN",
  "DATASOURCE_TOKEN_MINT_RATE_LIMIT_SHARE_TOKEN_PER_MIN",
  "DATASOURCE_SESSION_TTL_SECONDS",
  "GATEWAY_INTROSPECTION_RATE_LIMIT_PER_MIN",
  "GATEWAY_REVOKED_TOKENS_RATE_LIMIT_PER_MIN",
  "GATEWAY_REVOKED_TOKENS_MAX_BATCH",
  "REALTIME_REVOKE_EVENT_RETENTION_SECONDS",
];

const withEnv = async (overrides, run) => {
  const original = Object.fromEntries(CONFIG_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of CONFIG_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
      delete process.env[key];
      continue;
    }

    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
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

const TEST_CREDENTIAL_ENCRYPTION_KEY = Buffer.from(
  "4f9d2acb71e84c36a90f5e12d7b3c4aa5d61e8f90b2c47d38ea16f4bc9d2037f",
  "hex",
).toString("base64");
const TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/freeboard";

test("config rejects weak JWT secret in non-development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "short-secret",
      CREATE_ADMIN: "false",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "StrongPass123!",
      DATABASE_URL: TEST_DATABASE_URL,
      PORT: "4001",
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /JWT_SECRET is missing or too weak/);
    },
  );
});

test("config rejects deterministic local-dev JWT secret pattern in non-development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "freeboard-local-dev-jwt-secret-0123456789",
      CREATE_ADMIN: "false",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /JWT_SECRET is missing or too weak/);
    },
  );
});

test("config rejects deterministic local-dev credential encryption key in non-development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /CREDENTIAL_ENCRYPTION_KEY is missing, invalid, or weak/,
      );
    },
  );
});

test("config rejects memory security limiter backend in non-development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      SECURITY_LIMITER_BACKEND: "memory",
      CREATE_ADMIN: "false",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /SECURITY_LIMITER_BACKEND must not be set to 'memory'/,
      );
    },
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
      DATABASE_URL: TEST_DATABASE_URL,
      PORT: "4001",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /valid ADMIN_EMAIL/);
    },
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
      DATABASE_URL: TEST_DATABASE_URL,
      PORT: "4001",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /strong ADMIN_PASSWORD/);
    },
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
      DATABASE_URL: TEST_DATABASE_URL,
      PORT: "4001",
    },
    async () => {
      const { config } = await importConfigFresh();
      assert.equal(config.createAdmin, true);
      assert.equal(config.adminEmail, "admin@example.com");
    },
  );
});

test("config rejects non-postgres DB_BACKEND values", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      DB_BACKEND: "mongo",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /DB_BACKEND='mongo' is supported only in NODE_ENV=test during transition/,
      );
    },
  );
});

test("config allows DB_BACKEND=mongo in test runtime for compatibility tests", async () => {
  await withEnv(
    {
      NODE_ENV: "test",
      DB_BACKEND: "mongo",
      SECURITY_LIMITER_BACKEND: "",
      DATABASE_URL: "",
      FREEBOARD_POSTGRES_URL: "",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
    },
    async () => {
      const { config } = await importConfigFresh();
      assert.equal(config.dbBackend, "mongo");
      assert.equal(config.postgresUrl, null);
    },
  );
});

test("config requires Postgres URL", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      DATABASE_URL: "",
      FREEBOARD_POSTGRES_URL: "",
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /DATABASE_URL or FREEBOARD_POSTGRES_URL is required for Postgres runtime/,
      );
    },
  );
});

test("config rejects unsupported security limiter backend values", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      DATABASE_URL: TEST_DATABASE_URL,
      SECURITY_LIMITER_BACKEND: "mongo",
      JWT_GATEWAY_SECRET: "ThisIsALongEnoughGatewaySecretForTests123!",
      GATEWAY_SERVICE_TOKEN: "ThisIsALongEnoughGatewayServiceTokenForTests123!",
      CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    },
    async () => {
      await assert.rejects(
        () => importConfigFresh(),
        /SECURITY_LIMITER_BACKEND must be one of: memory, postgres/,
      );
    },
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
    },
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
      await assert.rejects(() => importConfigFresh(), /Invalid non-admin role/);
    },
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
      DASHBOARD_DEFAULT_VISIBILITY: "public",
      DASHBOARD_PUBLIC_LISTING_ENABLED: "true",
      EXECUTION_MODE: "trusted",
      POLICY_EDIT_LOCK: "true",
      AUTH_LOGIN_MAX_ATTEMPTS: "7",
      AUTH_LOGIN_WINDOW_SECONDS: "120",
      AUTH_LOGIN_LOCK_SECONDS: "180",
    },
    async () => {
      const { config } = await importConfigFresh();
      assert.equal(config.registrationMode, "open");
      assert.equal(config.registrationDefaultRole, "editor");
      assert.equal(config.editorCanPublish, true);
      assert.equal(config.dashboardDefaultVisibility, "public");
      assert.equal(config.dashboardPublicListingEnabled, true);
      assert.equal(config.executionMode, "trusted");
      assert.equal(config.policyEditLock, true);
      assert.equal(config.authLoginMaxAttempts, 7);
      assert.equal(config.authLoginWindowSeconds, 120);
      assert.equal(config.authLoginLockSeconds, 180);
    },
  );
});

test("config rejects unsupported dashboard default visibility", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      JWT_SECRET: "ThisIsALongEnoughJwtSecretForLocalTests123!",
      CREATE_ADMIN: "false",
      DASHBOARD_DEFAULT_VISIBILITY: "internal",
    },
    async () => {
      await assert.rejects(() => importConfigFresh(), /Invalid dashboard visibility/);
    },
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
    },
  );
});
