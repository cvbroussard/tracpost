import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";

const COOKIE_NAME = "tp_admin";

interface AdminPayload {
  admin: true;
  issued_at: number;
  expires_at: number;
}

/**
 * Check if the current request has a valid admin session.
 * Verifies HMAC signature and expiry; rejects forged or stale cookies.
 */
export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  const payload = verifyCookie<AdminPayload>(raw);
  if (!payload || !payload.admin) return false;
  if (payload.expires_at < Date.now()) return false;
  return true;
}

/**
 * Verify a NextRequest cookie (used by API routes that take a NextRequest).
 */
export function isAdminRequest(rawCookie: string | undefined): boolean {
  const payload = verifyCookie<AdminPayload>(rawCookie);
  if (!payload || !payload.admin) return false;
  if (payload.expires_at < Date.now()) return false;
  return true;
}
