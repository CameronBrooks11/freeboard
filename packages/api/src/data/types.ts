export type DataBackend = "postgres";

type PostgresModelPlaceholder = {
  (...args: unknown[]): never;
  new (...args: unknown[]): never;
  db?: unknown;
};

export type PostgresModelStore = {
  AuditEvent: PostgresModelPlaceholder;
  BrokerProfile: PostgresModelPlaceholder;
  CredentialProfile: PostgresModelPlaceholder;
  Dashboard: PostgresModelPlaceholder;
  InviteToken: PostgresModelPlaceholder;
  PasswordResetToken: PostgresModelPlaceholder;
  Policy: PostgresModelPlaceholder;
  SecurityLimiterState: PostgresModelPlaceholder;
  ServiceAccount: PostgresModelPlaceholder;
  ServiceAccountToken: PostgresModelPlaceholder;
  ShareTokenRevocationEvent: PostgresModelPlaceholder;
  User: PostgresModelPlaceholder;
};

export type ApiModelStore = PostgresModelStore;
export type RuntimeModelStore = PostgresModelStore;

export type ApiModelConstants = {
  BROKER_PROFILE_PROTOCOLS: readonly string[];
  CREDENTIAL_PROFILE_TYPES: readonly string[];
};
