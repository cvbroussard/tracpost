/**
 * Email OTP — 6-digit verification codes for sensitive actions.
 *
 * Codes stored as HMAC hash in subscriptions.metadata.
 * 10-minute TTL, one-time use.
 */
import { randomInt, createHmac } from "node:crypto";
import { sql } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";

const SECRET = process.env.SESSION_TOKEN_SECRET || process.env.META_APP_SECRET || "fallback";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate and send a 6-digit OTP to the user's email.
 */
export async function sendOtp(userId: string, action: string): Promise<boolean> {
  const [user] = await sql`
    SELECT email, billing_account_id FROM users WHERE id = ${userId} AND is_active = true
  `;

  if (!user?.email) return false;

  const code = String(randomInt(100000, 999999));
  const hash = createHmac("sha256", SECRET).update(code).digest("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  await sql`
    UPDATE accounts
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{otp}',
      ${JSON.stringify({ hash, expires_at: expiresAt, action })}::jsonb
    ),
    updated_at = NOW()
    WHERE id = ${user.subscription_id}
  `;

  return sendOtpEmail(user.email as string, code, action);
}

/**
 * Verify a 6-digit OTP code. Returns true if valid.
 * Clears the OTP on success (one-time use).
 */
export async function verifyOtp(userId: string, code: string, action: string): Promise<boolean> {
  const [user] = await sql`
    SELECT billing_account_id FROM users WHERE id = ${userId}
  `;
  if (!user) return false;

  const [sub] = await sql`
    SELECT metadata FROM accounts WHERE id = ${user.subscription_id}
  `;
  if (!sub) return false;

  const meta = (sub.metadata || {}) as Record<string, unknown>;
  const otp = meta.otp as { hash: string; expires_at: string; action: string } | undefined;

  if (!otp) return false;
  if (otp.action !== action) return false;
  if (new Date(otp.expires_at) < new Date()) return false;

  const hash = createHmac("sha256", SECRET).update(code).digest("hex");
  if (hash !== otp.hash) return false;

  // Clear OTP (one-time use)
  await sql`
    UPDATE accounts
    SET metadata = metadata - 'otp', updated_at = NOW()
    WHERE id = ${user.subscription_id}
  `;

  return true;
}
