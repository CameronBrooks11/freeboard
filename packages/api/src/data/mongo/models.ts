import AuditEvent from "../../models/AuditEvent.js";
import BrokerProfile, { BROKER_PROFILE_PROTOCOLS } from "../../models/BrokerProfile.js";
import CredentialProfile, { CREDENTIAL_PROFILE_TYPES } from "../../models/CredentialProfile.js";
import Dashboard from "../../models/Dashboard.js";
import InviteToken from "../../models/InviteToken.js";
import PasswordResetToken from "../../models/PasswordResetToken.js";
import Policy from "../../models/Policy.js";
import SecurityLimiterState from "../../models/SecurityLimiterState.js";
import ServiceAccount from "../../models/ServiceAccount.js";
import ServiceAccountToken from "../../models/ServiceAccountToken.js";
import ShareTokenRevocationEvent from "../../models/ShareTokenRevocationEvent.js";
import User from "../../models/User.js";
import type { ApiModelConstants, ApiModelStore } from "../types.js";

export const mongoModels: ApiModelStore = Object.freeze({
  AuditEvent,
  BrokerProfile,
  CredentialProfile,
  Dashboard,
  InviteToken,
  PasswordResetToken,
  Policy,
  SecurityLimiterState,
  ServiceAccount,
  ServiceAccountToken,
  ShareTokenRevocationEvent,
  User,
});

export const mongoModelConstants: ApiModelConstants = Object.freeze({
  BROKER_PROFILE_PROTOCOLS,
  CREDENTIAL_PROFILE_TYPES,
});
