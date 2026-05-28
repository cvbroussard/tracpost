/**
 * Magic link authentication for passwordless sign-in.
 */
import { randomBytes, createHmac } from "node:crypto";
import { sql } from "@/lib/db";

const SECRET = process.env.SESSION_TOKEN_SECRET || process.env.META_APP_SECRET || "fallback-secret";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a magic link token for a user.
 */
export async function generateMagicToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const hash = createHmac("sha256", SECRET).update(raw).digest("hex");

  await sql`
    UPDATE users
    SET magic_token_hash = ${hash}, magic_token_expires = ${expiresAt}
    WHERE id = ${userId}
  `;

  return Buffer.from(JSON.stringify({ sub: userId, tok: raw })).toString("base64url");
}

/**
 * Validate a magic link token. Returns user info if valid, null otherwise.
 * Clears the token on success (one-time use).
 */
export async function validateMagicToken(token: string): Promise<{
  id: string;
  name: string;
  subscriptionId: string;
  plan: string;
  role: string;
} | null> {
  let parsed: { sub: string; tok: string };
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString());
  } catch {
    return null;
  }

  const { sub: userId, tok: raw } = parsed;

  const [user] = await sql`
    SELECT u.id, u.name, u.role, u.billing_account_id, u.magic_token_hash, u.magic_token_expires,
           s.plan
    FROM users u
    JOIN accounts s ON u.billing_account_id = s.id
    WHERE u.id = ${userId} AND u.is_active = true
  `;

  if (!user) return null;
  if (!user.magic_token_hash) return null;

  if (new Date(user.magic_token_expires as string) < new Date()) {
    await sql`UPDATE users SET magic_token_hash = NULL, magic_token_expires = NULL WHERE id = ${userId}`;
    return null;
  }

  const hash = createHmac("sha256", SECRET).update(raw).digest("hex");
  if (hash !== user.magic_token_hash) return null;

  await sql`UPDATE users SET magic_token_hash = NULL, magic_token_expires = NULL WHERE id = ${userId}`;

  return {
    id: user.id as string,
    name: user.name as string,
    subscriptionId: user.billing_account_id as string,
    plan: (user.plan as string) || "free",
    role: (user.role as string) || "owner",
  };
}
