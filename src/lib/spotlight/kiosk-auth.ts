import { randomBytes, createHmac } from "node:crypto";
import { sql } from "@/lib/db";

const TOKEN_PREFIX = "tp_k_";

/**
 * Generate a kiosk authentication token.
 */
export function generateKioskToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("hex");
}

/**
 * Generate a 6-character alphanumeric session code.
 */
export function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export interface KioskContext {
  kioskId: string;
  siteId: string;
  subscriptionId: string;
  settings: Record<string, unknown>;
}

/**
 * Authenticate a kiosk request by token.
 * Token can be in query param or request body.
 */
export async function authenticateKiosk(
  token: string
): Promise<KioskContext | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;

  const [kiosk] = await sql`
    SELECT k.id, k.business_id, k.settings, s.billing_account_id
    FROM spotlight_kiosks k
    JOIN businesses s ON s.id = k.business_id
    WHERE k.kiosk_token = ${token} AND k.is_active = true
  `;

  if (!kiosk) return null;

  // Update last seen
  await sql`UPDATE spotlight_kiosks SET last_seen_at = NOW() WHERE id = ${kiosk.id}`;

  return {
    kioskId: kiosk.id,
    siteId: kiosk.business_id,
    subscriptionId: kiosk.billing_account_id,
    settings: (kiosk.settings as Record<string, unknown>) || {},
  };
}
