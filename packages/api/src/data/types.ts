import type AuditEvent from "../models/AuditEvent.js";
import type BrokerProfile from "../models/BrokerProfile.js";
import type CredentialProfile from "../models/CredentialProfile.js";
import type Dashboard from "../models/Dashboard.js";
import type InviteToken from "../models/InviteToken.js";
import type PasswordResetToken from "../models/PasswordResetToken.js";
import type Policy from "../models/Policy.js";
import type SecurityLimiterState from "../models/SecurityLimiterState.js";
import type ServiceAccount from "../models/ServiceAccount.js";
import type ServiceAccountToken from "../models/ServiceAccountToken.js";
import type ShareTokenRevocationEvent from "../models/ShareTokenRevocationEvent.js";
import type User from "../models/User.js";

export type DataBackend = "mongo" | "postgres";

export type ApiModelStore = {
  AuditEvent: typeof AuditEvent;
  BrokerProfile: typeof BrokerProfile;
  CredentialProfile: typeof CredentialProfile;
  Dashboard: typeof Dashboard;
  InviteToken: typeof InviteToken;
  PasswordResetToken: typeof PasswordResetToken;
  Policy: typeof Policy;
  SecurityLimiterState: typeof SecurityLimiterState;
  ServiceAccount: typeof ServiceAccount;
  ServiceAccountToken: typeof ServiceAccountToken;
  ShareTokenRevocationEvent: typeof ShareTokenRevocationEvent;
  User: typeof User;
};

export type ApiModelConstants = {
  BROKER_PROFILE_PROTOCOLS: readonly string[];
  CREDENTIAL_PROFILE_TYPES: readonly string[];
};
