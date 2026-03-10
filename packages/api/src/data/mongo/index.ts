import type { DataStore } from "../contracts.js";
import { mongoModelConstants, mongoModels } from "./models.js";
import { createMongoAuditRepository } from "./repositories/audit.js";
import { createMongoBrokerProfileRepository } from "./repositories/brokerProfiles.js";
import { createMongoCredentialProfileRepository } from "./repositories/credentialProfiles.js";
import { createMongoDashboardRepository } from "./repositories/dashboards.js";
import { createMongoInviteTokenRepository } from "./repositories/inviteTokens.js";
import { createMongoPasswordResetTokenRepository } from "./repositories/passwordResetTokens.js";
import { createMongoPolicyRepository } from "./repositories/policy.js";
import { createMongoSecurityLimiterRepository } from "./repositories/securityLimiter.js";
import { createMongoServiceAccountRepository } from "./repositories/serviceAccounts.js";
import { createMongoServiceAccountTokenRepository } from "./repositories/serviceAccountTokens.js";
import { createMongoShareTokenRevocationRepository } from "./repositories/shareTokenRevocationFeed.js";
import { createMongoUserRepository } from "./repositories/users.js";

export const createMongoDataStore = (): DataStore =>
  Object.freeze({
    backend: "mongo",
    models: mongoModels,
    constants: mongoModelConstants,
    repositories: Object.freeze({
      securityLimiter: createMongoSecurityLimiterRepository(mongoModels.SecurityLimiterState),
      shareTokenRevocationFeed: createMongoShareTokenRevocationRepository(
        mongoModels.ShareTokenRevocationEvent,
      ),
      policy: createMongoPolicyRepository(mongoModels.Policy),
      audit: createMongoAuditRepository(mongoModels.AuditEvent),
      credentialProfiles: createMongoCredentialProfileRepository(mongoModels.CredentialProfile),
      brokerProfiles: createMongoBrokerProfileRepository(mongoModels.BrokerProfile),
      dashboards: createMongoDashboardRepository(mongoModels.Dashboard),
      serviceAccounts: createMongoServiceAccountRepository(mongoModels.ServiceAccount),
      serviceAccountTokens: createMongoServiceAccountTokenRepository(
        mongoModels.ServiceAccountToken,
      ),
      inviteTokens: createMongoInviteTokenRepository(mongoModels.InviteToken),
      passwordResetTokens: createMongoPasswordResetTokenRepository(mongoModels.PasswordResetToken),
      users: createMongoUserRepository(mongoModels.User),
    }),
  });
