/**
 * Application-layer token encryption using AES-256-GCM.
 *
 * Encrypted values are prefixed with "enc:" to distinguish from
 * legacy plaintext tokens, enabling zero-downtime lazy migration.
 *
 * Env: ENCRYPTION_KEY — 32-byte hex string (64 chars)
 */
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:";

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  return Buffer.from(raw, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns "enc:" + base64(iv + ciphertext + authTag).
 * If ENCRYPTION_KEY is not set, returns plaintext with a warning.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    console.warn("ENCRYPTION_KEY not set — token stored as plaintext");
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, encrypted, authTag]);
  return PREFIX + payload.toString("base64");
}

/**
 * Decrypt an encrypted token string.
 * If the value does not start with "enc:", returns it as-is (plaintext passthrough).
 * If ENCRYPTION_KEY is not set and value starts with "enc:", throws.
 */
export function decrypt(value: string): string {
  if (!value || !value.startsWith(PREFIX)) {
    return value; // Legacy plaintext — pass through
  }

  const key = getKey();
  if (!key) {
    throw new Error("ENCRYPTION_KEY not set — cannot decrypt token");
  }

  const payload = Buffer.from(value.slice(PREFIX.length), "base64");

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
