import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const allowedBackends = new Set(["mongo", "postgres"]);

dotenv.config({ path: path.join(repoRoot, ".env") });

const decodeKey = (value, label) => {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  const decoded = Buffer.from(String(value), "base64");
  if (decoded.length !== 32) {
    throw new Error(`${label} must be base64-encoded 32-byte key`);
  }
  return decoded;
};

const decryptWithKey = (encrypted, key) => {
  if (!encrypted || encrypted.algorithm !== "aes-256-gcm") {
    return {};
  }
  const iv = Buffer.from(encrypted.iv, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
};

const encryptWithKey = (secret, key) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(secret || {}), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    keyId: "v1",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
  };
};

const resolveBackend = () => {
  const raw = String(process.env.DB_BACKEND || "postgres")
    .trim()
    .toLowerCase();
  if (!allowedBackends.has(raw)) {
    throw new Error("DB_BACKEND must be one of: postgres, mongo.");
  }
  return raw;
};

const resolvePostgresUrl = () => {
  const databaseUrl = String(process.env.DATABASE_URL || process.env.FREEBOARD_POSTGRES_URL || "")
    .trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or FREEBOARD_POSTGRES_URL is required when DB_BACKEND=postgres.",
    );
  }
  return databaseUrl;
};

const loadPoolConstructor = async () => {
  let importedModule;
  try {
    importedModule = await import("pg");
  } catch (error) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message || "Unknown error")
        : "Unknown error";
    throw new Error(
      `DB_BACKEND=postgres requires the 'pg' package. Install dependencies before running key rotation. Original error: ${errorMessage}`,
      { cause: error },
    );
  }
  const poolConstructor = importedModule?.Pool;
  if (typeof poolConstructor !== "function") {
    throw new Error("Failed to load PostgreSQL Pool constructor from 'pg'.");
  }
  return poolConstructor;
};

const runPostgresReencryption = async ({ oldKey, newKey }) => {
  const Pool = await loadPoolConstructor();
  const pool = new Pool({ connectionString: resolvePostgresUrl() });

  let scanned = 0;
  let updated = 0;

  try {
    const profiles = await pool.query("SELECT id, secret FROM credential_profiles ORDER BY id ASC");
    for (const row of profiles.rows) {
      scanned += 1;
      const decrypted = decryptWithKey(row.secret, oldKey);
      const nextSecret = encryptWithKey(decrypted, newKey);
      await pool.query(
        `
        UPDATE credential_profiles
        SET secret = $1, updated_at = NOW()
        WHERE id = $2
        `,
        [nextSecret, String(row.id || "")],
      );
      updated += 1;
    }
  } finally {
    await pool.end();
  }

  return { scanned, updated };
};

const runMongoReencryption = async ({ oldKey, newKey }) => {
  const { default: mongoose } = await import("mongoose");
  const { default: CredentialProfile } = await import("../packages/api/src/models/CredentialProfile.ts");

  const mongoUrl = String(process.env.MONGO_URL || "").trim();
  if (!mongoUrl) {
    throw new Error("MONGO_URL is required when DB_BACKEND=mongo.");
  }

  await mongoose.connect(mongoUrl);

  let scanned = 0;
  let updated = 0;

  try {
    for await (const profile of CredentialProfile.find({}).cursor()) {
      scanned += 1;
      const decrypted = decryptWithKey(profile.secret, oldKey);
      const nextSecret = encryptWithKey(decrypted, newKey);
      await CredentialProfile.updateOne({ _id: profile._id }, { $set: { secret: nextSecret } });
      updated += 1;
    }
  } finally {
    await mongoose.disconnect();
  }

  return { scanned, updated };
};

const oldKey = decodeKey(
  process.env.CREDENTIAL_ENCRYPTION_KEY_OLD || process.env.CREDENTIAL_ENCRYPTION_KEY,
  "CREDENTIAL_ENCRYPTION_KEY_OLD (or CREDENTIAL_ENCRYPTION_KEY)",
);
const newKey = decodeKey(
  process.env.CREDENTIAL_ENCRYPTION_KEY_NEW,
  "CREDENTIAL_ENCRYPTION_KEY_NEW",
);

if (Buffer.compare(oldKey, newKey) === 0) {
  throw new Error("Old and new credential encryption keys are identical");
}

const backend = resolveBackend();
const result =
  backend === "postgres"
    ? await runPostgresReencryption({ oldKey, newKey })
    : await runMongoReencryption({ oldKey, newKey });

console.log(
  `Credential re-encryption completed for backend=${backend}. scanned=${result.scanned} updated=${result.updated}`,
);
