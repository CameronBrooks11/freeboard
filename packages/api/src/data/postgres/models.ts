import type { ApiModelConstants, ApiModelStore } from "../types.js";

type PlaceholderCallable = {
  (...args: unknown[]): never;
  new (...args: unknown[]): never;
};

const createNotImplementedError = (modelName: string, operation: string): Error =>
  new Error(
    `DB_BACKEND=postgres model '${modelName}' does not implement '${operation}' yet. Complete Sprint 30.4 Postgres repositories before enabling this path in production.`,
  );

const createPostgresModelPlaceholder = (modelName: string): PlaceholderCallable => {
  const placeholder = function postgresModelPlaceholder(): never {
    throw createNotImplementedError(modelName, "call");
  } as PlaceholderCallable;

  return new Proxy(placeholder, {
    apply(): never {
      throw createNotImplementedError(modelName, "call");
    },
    construct(): never {
      throw createNotImplementedError(modelName, "construct");
    },
    get(_target, propertyKey): unknown {
      if (propertyKey === "db") {
        return undefined;
      }
      if (propertyKey === Symbol.toStringTag) {
        return "PostgresModelPlaceholder";
      }
      return (..._args: unknown[]): never => {
        throw createNotImplementedError(modelName, String(propertyKey));
      };
    },
  }) as PlaceholderCallable;
};

const createPostgresModelStore = (): ApiModelStore =>
  ({
    AuditEvent: createPostgresModelPlaceholder("AuditEvent"),
    BrokerProfile: createPostgresModelPlaceholder("BrokerProfile"),
    CredentialProfile: createPostgresModelPlaceholder("CredentialProfile"),
    Dashboard: createPostgresModelPlaceholder("Dashboard"),
    InviteToken: createPostgresModelPlaceholder("InviteToken"),
    PasswordResetToken: createPostgresModelPlaceholder("PasswordResetToken"),
    Policy: createPostgresModelPlaceholder("Policy"),
    SecurityLimiterState: createPostgresModelPlaceholder("SecurityLimiterState"),
    ServiceAccount: createPostgresModelPlaceholder("ServiceAccount"),
    ServiceAccountToken: createPostgresModelPlaceholder("ServiceAccountToken"),
    ShareTokenRevocationEvent: createPostgresModelPlaceholder("ShareTokenRevocationEvent"),
    User: createPostgresModelPlaceholder("User"),
  }) as unknown as ApiModelStore;

export const postgresModels: ApiModelStore = Object.freeze(createPostgresModelStore());

export const postgresModelConstants: ApiModelConstants = Object.freeze({
  BROKER_PROFILE_PROTOCOLS: Object.freeze(["mqtt"]),
  CREDENTIAL_PROFILE_TYPES: Object.freeze(["none", "header", "bearer", "basic"]),
});
