import type { ApiModelConstants, DataBackend, RuntimeModelStore } from "./types.js";

export type SecurityLimiterRepository = {
  incrementCounter(params: { documentId: string; expiresAt: Date }): Promise<number>;
  getLockUntil(params: { documentId: string }): Promise<Date | null>;
  upsertLock(params: { documentId: string; lockUntil: Date; expiresAt: Date }): Promise<void>;
  deleteCounterByPrefix(params: { counterPrefix: string }): Promise<void>;
  deleteById(params: { documentId: string }): Promise<void>;
};

export type ShareTokenRevocationEventRecord = {
  eventId: string;
  dashboardId: string;
  shareTokenVersion: number;
  revokedAt: Date;
  createdAt: Date;
};

export type ShareTokenRevocationRepository = {
  isReady(): Promise<boolean> | boolean;
  insertEvent(params: {
    dashboardId: string;
    shareTokenVersion: number;
    revokedAt: Date;
  }): Promise<void>;
  queryEvents(params: {
    retentionCutoff: Date;
    cursor: { createdAt: Date; eventId: string } | null;
    limit: number;
  }): Promise<ShareTokenRevocationEventRecord[]>;
};

export type PolicyRepository = {
  readValue(params: { key: string }): Promise<unknown>;
  writeValue(params: { key: string; value: unknown; updatedBy?: string | null }): Promise<void>;
};

export type AuditEventRecord = {
  _id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditRepository = {
  isReady(): Promise<boolean> | boolean;
  insertEvent(params: {
    actorUserId?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  queryEvents(params: { actionPrefix?: string | null; limit: number }): Promise<AuditEventRecord[]>;
};

export type CredentialProfileRecord = {
  _id: string;
  name: string;
  description: string;
  type: string;
  allowPublicUse: boolean;
  metadata: Record<string, unknown>;
  secret: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CredentialProfileRepository = {
  listSortedByName(): Promise<CredentialProfileRecord[]>;
  findById(params: { profileId: string }): Promise<CredentialProfileRecord | null>;
  create(params: {
    name: string;
    description: string;
    type: string;
    allowPublicUse: boolean;
    metadata: Record<string, unknown>;
    secret: Record<string, unknown>;
    createdBy: string | null;
    updatedBy: string | null;
  }): Promise<CredentialProfileRecord>;
  updateById(params: {
    profileId: string;
    patch: {
      name?: string;
      description?: string;
      type?: string;
      allowPublicUse?: boolean;
      metadata?: Record<string, unknown>;
      secret?: Record<string, unknown>;
      updatedBy?: string | null;
    };
  }): Promise<CredentialProfileRecord | null>;
  deleteById(params: { profileId: string }): Promise<CredentialProfileRecord | null>;
};

export type BrokerProfileRecord = {
  _id: string;
  name: string;
  description: string;
  protocol: string;
  brokerUrl: string;
  tls: Record<string, unknown>;
  credentialProfileId: string | null;
  allowPublicUse: boolean;
  topicAllowlist: string[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BrokerProfileRepository = {
  listSortedByName(params: { protocol?: string | null }): Promise<BrokerProfileRecord[]>;
  findById(params: { profileId: string }): Promise<BrokerProfileRecord | null>;
  findByIds(params: { profileIds: string[] }): Promise<BrokerProfileRecord[]>;
  create(params: {
    name: string;
    description: string;
    protocol: string;
    brokerUrl: string;
    tls: Record<string, unknown>;
    credentialProfileId: string | null;
    allowPublicUse: boolean;
    topicAllowlist: string[];
    createdBy: string | null;
    updatedBy: string | null;
  }): Promise<BrokerProfileRecord>;
  updateById(params: {
    profileId: string;
    patch: {
      name?: string;
      description?: string;
      protocol?: string;
      brokerUrl?: string;
      tls?: Record<string, unknown>;
      credentialProfileId?: string | null;
      allowPublicUse?: boolean;
      topicAllowlist?: string[];
      updatedBy?: string | null;
    };
  }): Promise<BrokerProfileRecord | null>;
  deleteById(params: { profileId: string }): Promise<BrokerProfileRecord | null>;
};

export type DashboardAclEntryRecord = {
  userId: string;
  accessLevel: string;
  grantedBy?: string | null;
  grantedAt?: Date;
};

export type DashboardDatasourceRecord = Record<string, unknown> & {
  id?: unknown;
  type?: string | null;
  settings?: Record<string, unknown> | null;
};

export type DashboardRecord = {
  _id: string;
  user: string;
  visibility: string;
  shareToken: string;
  shareTokenVersion: number;
  acl: DashboardAclEntryRecord[];
  document: Record<string, unknown>;
  /** Optimistic-concurrency counter, bumped only when `document` changes. */
  documentRevision: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Thrown by `updateById` when a document write carries an `expectedDocumentRevision`
 * that no longer matches the stored revision — i.e. the dashboard was changed by
 * someone else since it was loaded. The current revision is attached so callers
 * can surface it.
 */
export class DashboardRevisionConflictError extends Error {
  readonly currentRevision: number;
  constructor(currentRevision: number) {
    super("Dashboard was modified by another writer");
    this.name = "DashboardRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export type DashboardRepository = {
  findById(params: { dashboardId: string }): Promise<DashboardRecord | null>;
  findByShareToken(params: { shareToken: string }): Promise<DashboardRecord | null>;
  listAll(): Promise<DashboardRecord[]>;
  listAccessible(params: {
    viewerUserId: string;
    includePublic: boolean;
  }): Promise<DashboardRecord[]>;
  listForDiagnostics(): Promise<
    Array<
      Pick<DashboardRecord, "_id" | "visibility"> & { datasources: DashboardDatasourceRecord[] }
    >
  >;
  findImpactedByUserId(params: { userId: string }): Promise<DashboardRecord[]>;
  create(params: {
    visibility?: unknown;
    user: unknown;
    shareToken?: unknown;
    shareTokenVersion?: unknown;
    acl?: DashboardAclEntryRecord[];
    document?: unknown;
  }): Promise<DashboardRecord>;
  updateById(params: {
    dashboardId: string;
    patch: {
      user?: unknown;
      visibility?: unknown;
      shareToken?: unknown;
      shareTokenVersion?: unknown;
      acl?: DashboardAclEntryRecord[];
      document?: unknown;
    };
    /**
     * When the patch updates `document`, guard the write with this expected
     * revision: the update only applies if the stored revision still matches,
     * otherwise {@link DashboardRevisionConflictError} is thrown. Ignored for
     * envelope-only updates (no `document`).
     */
    expectedDocumentRevision?: number | undefined;
  }): Promise<DashboardRecord | null>;
  /**
   * Grant or update a single ACL entry atomically (INSERT ... ON CONFLICT), so
   * concurrent grants/revokes don't clobber one another the way a full-array
   * replacement does. Returns the updated dashboard, or null if it's gone.
   */
  upsertAclEntry(params: {
    dashboardId: string;
    entry: DashboardAclEntryRecord;
  }): Promise<DashboardRecord | null>;
  /** Revoke a single ACL entry atomically (keyed DELETE). */
  deleteAclEntry(params: { dashboardId: string; userId: string }): Promise<DashboardRecord | null>;
  deleteById(params: { dashboardId: string }): Promise<DashboardRecord | null>;
};

export type ServiceAccountRecord = {
  _id: string;
  name: string;
  description: string;
  active: boolean;
  scopes: string[];
  createdByUserId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceAccountTokenRecord = {
  _id: string;
  serviceAccountId: string;
  label: string | null;
  scopes: string[];
  tokenHash: string;
  tokenPrefix: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdByUserId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceAccountRepository = {
  listSortedByCreatedAtDesc(): Promise<ServiceAccountRecord[]>;
  findById(params: { accountId: string }): Promise<ServiceAccountRecord | null>;
  findActiveById(params: { accountId: string }): Promise<ServiceAccountRecord | null>;
  create(params: {
    name: string;
    description: string;
    active: boolean;
    scopes: string[];
    createdByUserId: string | null;
  }): Promise<ServiceAccountRecord>;
  updateById(params: {
    accountId: string;
    patch: {
      name?: string;
      description?: string;
      active?: boolean;
      scopes?: string[];
    };
  }): Promise<ServiceAccountRecord | null>;
  deleteById(params: { accountId: string }): Promise<ServiceAccountRecord | null>;
  touchLastUsed(params: { accountId: string; lastUsedAt: Date }): Promise<void>;
};

export type ServiceAccountTokenRepository = {
  listActive(): Promise<ServiceAccountTokenRecord[]>;
  listByServiceAccountIdSortedByCreatedAtDesc(params: {
    serviceAccountId: string;
  }): Promise<ServiceAccountTokenRecord[]>;
  findById(params: { tokenId: string }): Promise<ServiceAccountTokenRecord | null>;
  create(params: {
    serviceAccountId: string;
    label: string | null;
    scopes: string[];
    tokenHash: string;
    tokenPrefix: string;
    expiresAt: Date | null;
    createdByUserId: string | null;
  }): Promise<ServiceAccountTokenRecord>;
  touchLastUsed(params: { tokenId: string; lastUsedAt: Date }): Promise<void>;
  countActiveByServiceAccountId(params: { serviceAccountId: string }): Promise<number>;
  revokeById(params: {
    tokenId: string;
    revokedAt: Date;
  }): Promise<ServiceAccountTokenRecord | null>;
  revokeActiveByServiceAccountId(params: {
    serviceAccountId: string;
    revokedAt: Date;
  }): Promise<void>;
};

export type InviteTokenRecord = {
  _id: string;
  email: string;
  role: string;
  tokenHash: string;
  createdBy: string | null;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  acceptedUserId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type InviteTokenRepository = {
  listPending(params: { now: Date }): Promise<InviteTokenRecord[]>;
  findActiveByTokenHash(params: {
    tokenHash: string;
    now: Date;
  }): Promise<InviteTokenRecord | null>;
  revokePendingByEmail(params: { email: string; now: Date }): Promise<void>;
  create(params: {
    email: string;
    role: string;
    tokenHash: string;
    createdBy: string | null;
    expiresAt: Date;
  }): Promise<InviteTokenRecord>;
  markAcceptedById(params: {
    inviteId: string;
    acceptedAt: Date;
    acceptedUserId: string;
  }): Promise<void>;
  revokePendingById(params: { inviteId: string; now: Date }): Promise<InviteTokenRecord | null>;
};

export type PasswordResetTokenRecord = {
  _id: string;
  userId: string;
  tokenHash: string;
  createdBy: string | null;
  requestedByEmail: string | null;
  revokedAt: Date | null;
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type PasswordResetTokenRepository = {
  findActiveByTokenHash(params: {
    tokenHash: string;
    now: Date;
  }): Promise<PasswordResetTokenRecord | null>;
  revokeActiveByUserId(params: { userId: string; now: Date }): Promise<void>;
  create(params: {
    userId: string;
    tokenHash: string;
    createdBy: string | null;
    requestedByEmail: string | null;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord>;
  markUsedById(params: { tokenId: string; usedAt: Date }): Promise<void>;
};

export type UserRecord = {
  _id: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
  sessionVersion: number;
  registrationDate: Date;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type UserRepository = {
  listAll(): Promise<UserRecord[]>;
  countAll(): Promise<number>;
  countActiveAdminsExcludingUser(params: { excludedUserId: string }): Promise<number>;
  findFirstActiveAdmin(params: { excludedUserId?: string | null }): Promise<UserRecord | null>;
  findByIds(params: { userIds: string[] }): Promise<UserRecord[]>;
  findById(params: { userId: string }): Promise<UserRecord | null>;
  findActiveById(params: { userId: string }): Promise<UserRecord | null>;
  findByEmail(params: { email: string }): Promise<UserRecord | null>;
  findActiveByEmail(params: { email: string }): Promise<UserRecord | null>;
  create(params: {
    email: string;
    password: string;
    role: string;
    active: boolean;
  }): Promise<UserRecord>;
  updateById(params: {
    userId: string;
    patch: {
      role?: string;
      active?: boolean;
    };
    incrementSessionVersion?: boolean;
  }): Promise<UserRecord | null>;
  deleteById(params: { userId: string }): Promise<UserRecord | null>;
  touchLastLogin(params: { userId: string; lastLogin: Date }): Promise<void>;
  setPasswordAndIncrementSessionVersion(params: {
    userId: string;
    password: string;
  }): Promise<UserRecord | null>;
};

export type DataStoreRepositories = {
  securityLimiter: SecurityLimiterRepository;
  shareTokenRevocationFeed: ShareTokenRevocationRepository;
  policy: PolicyRepository;
  audit: AuditRepository;
  credentialProfiles: CredentialProfileRepository;
  brokerProfiles: BrokerProfileRepository;
  dashboards: DashboardRepository;
  serviceAccounts: ServiceAccountRepository;
  serviceAccountTokens: ServiceAccountTokenRepository;
  inviteTokens: InviteTokenRepository;
  passwordResetTokens: PasswordResetTokenRepository;
  users: UserRepository;
};

export type DataStore = {
  backend: DataBackend;
  models: RuntimeModelStore;
  constants: ApiModelConstants;
  repositories: DataStoreRepositories;
};
