import type { DataStore } from "../contracts.js";
import type { ApiModelConstants } from "../types.js";
import { createPostgresAuditRepository } from "./repositories/audit.js";
import { createPostgresBrokerProfileRepository } from "./repositories/brokerProfiles.js";
import { createPostgresCredentialProfileRepository } from "./repositories/credentialProfiles.js";
import { createPostgresDashboardRepository } from "./repositories/dashboards.js";
import { createPostgresInviteTokenRepository } from "./repositories/inviteTokens.js";
import { createPostgresPasswordResetTokenRepository } from "./repositories/passwordResetTokens.js";
import { createPostgresPolicyRepository } from "./repositories/policy.js";
import { createPostgresSecurityLimiterRepository } from "./repositories/securityLimiter.js";
import { createPostgresServiceAccountRepository } from "./repositories/serviceAccounts.js";
import { createPostgresServiceAccountTokenRepository } from "./repositories/serviceAccountTokens.js";
import { createPostgresShareTokenRevocationRepository } from "./repositories/shareTokenRevocationFeed.js";
import { createPostgresUserRepository } from "./repositories/users.js";

const postgresModelConstants: ApiModelConstants = Object.freeze({
  BROKER_PROFILE_PROTOCOLS: Object.freeze(["mqtt"]),
  CREDENTIAL_PROFILE_TYPES: Object.freeze(["none", "header", "bearer", "basic"]),
});

export const createPostgresDataStore = (): DataStore =>
  Object.freeze({
    backend: "postgres",
    constants: postgresModelConstants,
    repositories: Object.freeze({
      securityLimiter: createPostgresSecurityLimiterRepository(),
      shareTokenRevocationFeed: createPostgresShareTokenRevocationRepository(),
      policy: createPostgresPolicyRepository(),
      audit: createPostgresAuditRepository(),
      credentialProfiles: createPostgresCredentialProfileRepository(),
      brokerProfiles: createPostgresBrokerProfileRepository(),
      dashboards: createPostgresDashboardRepository(),
      serviceAccounts: createPostgresServiceAccountRepository(),
      serviceAccountTokens: createPostgresServiceAccountTokenRepository(),
      inviteTokens: createPostgresInviteTokenRepository(),
      passwordResetTokens: createPostgresPasswordResetTokenRepository(),
      users: createPostgresUserRepository(),
    }),
  });
