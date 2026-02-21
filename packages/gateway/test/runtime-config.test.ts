import assert from "node:assert/strict";
import { test } from "node:test";

const CONFIG_ENV_KEYS = [
  "NODE_ENV",
  "EGRESS_ALLOW_INSECURE_TLS",
  "EGRESS_ALLOWED_HOSTS",
  "EGRESS_ALLOWED_PORTS",
  "JWT_GATEWAY_SECRET",
  "GATEWAY_SERVICE_TOKEN",
  "REALTIME_LIMITER_FAILURE_MODE",
];

const STRONG_GATEWAY_SECRET = "ThisIsALongEnoughGatewaySecretForConfigTests123!";
const STRONG_GATEWAY_SERVICE_TOKEN = "ThisIsALongEnoughGatewayServiceTokenForConfigTests123!";

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> => {
  const original = Object.fromEntries(CONFIG_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of CONFIG_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
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

const importRuntimeConfigFresh = async () =>
  import(`../src/runtimeConfig.js?case=${Date.now()}-${Math.random()}`);

test("runtime config uses fail-open realtime limiter default in development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      REALTIME_LIMITER_FAILURE_MODE: undefined,
      EGRESS_ALLOWED_HOSTS: undefined,
      JWT_GATEWAY_SECRET: undefined,
      GATEWAY_SERVICE_TOKEN: undefined,
    },
    async () => {
      const runtimeConfig = await importRuntimeConfigFresh();
      assert.equal(runtimeConfig.getRealtimeLimiterFailureMode(), "fail-open");
    },
  );
});

test("runtime config uses fail-closed realtime limiter default in staging runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "staging",
      REALTIME_LIMITER_FAILURE_MODE: undefined,
      EGRESS_ALLOWED_HOSTS: "example.com",
      JWT_GATEWAY_SECRET: STRONG_GATEWAY_SECRET,
      GATEWAY_SERVICE_TOKEN: STRONG_GATEWAY_SERVICE_TOKEN,
    },
    async () => {
      const runtimeConfig = await importRuntimeConfigFresh();
      assert.equal(runtimeConfig.getRealtimeLimiterFailureMode(), "fail-closed");
    },
  );
});

test("runtime config requires egress host allowlist in qa runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "qa",
      EGRESS_ALLOWED_HOSTS: undefined,
      JWT_GATEWAY_SECRET: STRONG_GATEWAY_SECRET,
      GATEWAY_SERVICE_TOKEN: STRONG_GATEWAY_SERVICE_TOKEN,
    },
    async () => {
      await assert.rejects(
        () => importRuntimeConfigFresh(),
        /EGRESS_ALLOWED_HOSTS must be configured in non-development runtime/,
      );
    },
  );
});

test("runtime config rejects deterministic local-dev gateway secret in qa runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "qa",
      EGRESS_ALLOWED_HOSTS: "example.com",
      JWT_GATEWAY_SECRET: "freeboard-local-dev-gateway-secret-0123456789",
      GATEWAY_SERVICE_TOKEN: STRONG_GATEWAY_SERVICE_TOKEN,
    },
    async () => {
      await assert.rejects(
        () => importRuntimeConfigFresh(),
        /JWT_GATEWAY_SECRET is missing or too weak for non-development runtime/,
      );
    },
  );
});

test("runtime config rejects deterministic local-dev service token in qa runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "qa",
      EGRESS_ALLOWED_HOSTS: "example.com",
      JWT_GATEWAY_SECRET: STRONG_GATEWAY_SECRET,
      GATEWAY_SERVICE_TOKEN: "freeboard-local-dev-gateway-service-token-0123456789",
    },
    async () => {
      await assert.rejects(
        () => importRuntimeConfigFresh(),
        /GATEWAY_SERVICE_TOKEN is missing or too weak for non-development runtime/,
      );
    },
  );
});

test("runtime config rejects insecure TLS override in non-development runtime", async () => {
  await withEnv(
    {
      NODE_ENV: "staging",
      EGRESS_ALLOW_INSECURE_TLS: "true",
      EGRESS_ALLOWED_HOSTS: "example.com",
      JWT_GATEWAY_SECRET: STRONG_GATEWAY_SECRET,
      GATEWAY_SERVICE_TOKEN: STRONG_GATEWAY_SERVICE_TOKEN,
    },
    async () => {
      await assert.rejects(
        () => importRuntimeConfigFresh(),
        /EGRESS_ALLOW_INSECURE_TLS=true is not allowed in non-development runtime/,
      );
    },
  );
});
