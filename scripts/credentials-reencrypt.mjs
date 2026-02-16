import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import CredentialProfile from "../packages/api/src/models/CredentialProfile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

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

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) {
  throw new Error("MONGO_URL is required");
}

const oldKey = decodeKey(
  process.env.CREDENTIAL_ENCRYPTION_KEY_OLD || process.env.CREDENTIAL_ENCRYPTION_KEY,
  "CREDENTIAL_ENCRYPTION_KEY_OLD (or CREDENTIAL_ENCRYPTION_KEY)"
);
const newKey = decodeKey(
  process.env.CREDENTIAL_ENCRYPTION_KEY_NEW,
  "CREDENTIAL_ENCRYPTION_KEY_NEW"
);

if (Buffer.compare(oldKey, newKey) === 0) {
  throw new Error("Old and new credential encryption keys are identical");
}

await mongoose.connect(mongoUrl);

let scanned = 0;
let updated = 0;

for await (const profile of CredentialProfile.find({}).cursor()) {
  scanned += 1;
  const decrypted = decryptWithKey(profile.secret, oldKey);
  const nextSecret = encryptWithKey(decrypted, newKey);
  await CredentialProfile.updateOne({ _id: profile._id }, { $set: { secret: nextSecret } });
  updated += 1;
}

await mongoose.disconnect();
console.log(`Credential re-encryption completed. scanned=${scanned} updated=${updated}`);
