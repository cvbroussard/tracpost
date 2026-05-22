/**
 * Edge-runtime-compatible HMAC cookie verifier.
 *
 * `cookie-sign.ts` uses `node:crypto`, which Next.js middleware cannot
 * import (middleware always runs in Edge runtime). This file provides
 * the same verification using Web Crypto (`crypto.subtle.verify`),
 * which is available in Edge.
 *
 * Use ONLY for verification (the read path) — signing happens in
 * route handlers and Server Actions, which run in Node and use the
 * standard `signCookie` from `cookie-sign.ts`.
 *
 * Must use the same SECRET source as `cookie-sign.ts` so signatures
 * produced by `signCookie()` verify here.
 */

/**
 * Resolve the signing secret. Read PER CALL — never at module scope. In the
 * Edge runtime, .env.local vars are NOT in process.env at module-evaluation
 * time, only at request time. A module-level `const SECRET = process.env...`
 * captures the "tracpost-dev-secret" fallback and then silently rejects
 * every cookie that the Node route signed with the real secret.
 */
function resolveSecret(): string {
  return (
    process.env.SESSION_TOKEN_SECRET ||
    process.env.META_APP_SECRET ||
    "tracpost-dev-secret"
  );
}

// Cache the imported CryptoKey keyed by the secret value — keying by value
// means a stale fallback secret can never poison a later correct lookup.
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(): Promise<CryptoKey> {
  const secret = resolveSecret();
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function b64urlToArrayBuffer(s: string): ArrayBuffer {
  // Convert base64url → standard base64, pad, then decode via atob.
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const bin = atob(b64 + "=".repeat(pad));
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buffer;
}

function b64urlDecodeToText(s: string): string {
  return new TextDecoder().decode(b64urlToArrayBuffer(s));
}

/**
 * Verify and decode an HMAC-signed cookie produced by `signCookie()`.
 * Returns the payload object on success, null if missing, malformed,
 * tampered, or unparseable.
 */
export async function verifyCookieEdge<T>(
  raw: string | undefined | null,
): Promise<T | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await getKey();
    const sig = b64urlToArrayBuffer(sigB64);
    const data = new TextEncoder().encode(payloadB64);
    // The encode result is a Uint8Array<ArrayBufferLike>; copy into a
    // fresh ArrayBuffer for stricter TS lib targets where SharedArrayBuffer
    // unions trip up subtle.verify's BufferSource parameter.
    const dataBuf = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    const ok = await crypto.subtle.verify("HMAC", key, sig, dataBuf);
    if (!ok) return null;
    return JSON.parse(b64urlDecodeToText(payloadB64)) as T;
  } catch {
    return null;
  }
}

interface AdminPayload {
  admin: boolean;
  issued_at: number;
  expires_at: number;
}

/**
 * Convenience: verify a `tp_admin` cookie value and check expiry.
 * Returns true only if the cookie is signed correctly AND not expired
 * AND carries `admin: true`.
 */
export async function isAdminCookieValidEdge(
  raw: string | undefined | null,
): Promise<boolean> {
  const payload = await verifyCookieEdge<AdminPayload>(raw);
  if (!payload || !payload.admin) return false;
  if (typeof payload.expires_at !== "number") return false;
  if (payload.expires_at < Date.now()) return false;
  return true;
}
