/**
 * HMAC-signed cookie helper.
 *
 * Format: base64url(JSON payload) + "." + base64url(hmac-sha256 of base64-payload)
 *
 * Cookies signed via this helper can't be forged client-side without
 * knowing SESSION_TOKEN_SECRET. Tampering with the payload breaks the
 * HMAC and `verifyCookie` returns null.
 *
 * Used for `tp_session` (subscriber dashboard session) and `tp_admin`
 * (operator admin session). Replaces the prior plain-JSON encoding.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET =
  process.env.SESSION_TOKEN_SECRET ||
  process.env.META_APP_SECRET ||
  "tracpost-dev-secret";

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function hmac(payloadB64: string): string {
  return createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

/**
 * Sign a payload object into a cookie-safe string.
 */
export function signCookie<T>(payload: T): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(json);
  const sig = hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify and decode a signed cookie. Returns the payload if valid, null otherwise.
 * Tampering, missing signature, or invalid base64 all yield null.
 */
export function verifyCookie<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = hmac(payloadB64);

  // Constant-time comparison
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(b64urlDecode(payloadB64)) as T;
  } catch {
    return null;
  }
}
