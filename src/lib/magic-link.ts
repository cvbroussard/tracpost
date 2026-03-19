/**
 * Magic link authentication for passwordless onboarding.
 *
 * Flow:
 * 1. Stripe webhook creates subscriber → generates magic token
 * 2. Welcome email includes link: /auth/magic?token=xxx
 * 3. Subscriber clicks → token validated → session created → dashboard
 * 4. Subscriber sets password later in Settings (optional, for mobile app)
 */
import { randomBytes, createHmac } from "node:crypto";
import { sql } from "@/lib/db";

const SECRET = process.env.SESSION_TOKEN_SECRET || process.env.META_APP_SECRET || "fallback-secret";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a magic link token for a subscriber.
 * Stores the token hash in subscriber metadata.
 */
export async function generateMagicToken(subscriberId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Hash the token for storage (don't store raw)
  const hash = createHmac("sha256", SECRET).update(raw).digest("hex");

  await sql`
    UPDATE subscribers
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{magic_token}',
      ${JSON.stringify({ hash, expires_at: expiresAt })}::jsonb
    ),
    updated_at = NOW()
    WHERE id = ${subscriberId}
  `;

  // The token encodes subscriber ID + raw token
  return Buffer.from(JSON.stringify({
    sub: subscriberId,
    tok: raw,
  })).toString("base64url");
}

/**
 * Validate a magic link token. Returns subscriber ID if valid.
 */
export async function validateMagicToken(token: string): Promise<string | null> {
  let parsed: { sub: string; tok: string };
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString());
  } catch {
    return null;
  }

  const { sub: subscriberId, tok: raw } = parsed;

  const [subscriber] = await sql`
    SELECT id, metadata FROM subscribers
    WHERE id = ${subscriberId} AND is_active = true
  `;

  if (!subscriber) return null;

  const meta = (subscriber.metadata || {}) as Record<string, unknown>;
  const magicToken = meta.magic_token as { hash: string; expires_at: string } | undefined;

  if (!magicToken) return null;

  // Check expiry
  if (new Date(magicToken.expires_at) < new Date()) {
    return null;
  }

  // Verify hash
  const hash = createHmac("sha256", SECRET).update(raw).digest("hex");
  if (hash !== magicToken.hash) {
    return null;
  }

  // Clear the token (one-time use)
  await sql`
    UPDATE subscribers
    SET metadata = metadata - 'magic_token', updated_at = NOW()
    WHERE id = ${subscriberId}
  `;

  return subscriberId;
}
