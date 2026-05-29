import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";

const COOKIE_NAME = "tp_admin";

interface AdminPayload {
  admin: true;
  issued_at: number;
  expires_at: number;
}

/** Validate the legacy shared-secret tp_admin cookie (HMAC + expiry). */
function adminCookieValid(raw: string | undefined): boolean {
  const payload = verifyCookie<AdminPayload>(raw);
  if (!payload || !payload.admin) return false;
  if (payload.expires_at < Date.now()) return false;
  return true;
}

/**
 * v3 staff authorization: a signed tp_session carrying a platform or operator
 * principal authorizes the admin/manage surfaces — the same credential the
 * canonical login bakes in. Lets real staff users (e.g. the accountless super
 * admin, ops@) use the admin APIs without the shared tp_admin password cookie.
 */
async function sessionIsStaff(): Promise<boolean> {
  const jar = await cookies();
  const session = verifyCookie<{ principalType?: string }>(jar.get("tp_session")?.value);
  return session?.principalType === "platform" || session?.principalType === "operator";
}

/**
 * Check if the current request has a valid admin session (page/server-component
 * path). True for the legacy tp_admin cookie OR a platform/operator tp_session.
 */
export async function getAdminSession(): Promise<boolean> {
  const jar = await cookies();
  if (adminCookieValid(jar.get(COOKIE_NAME)?.value)) return true;
  return sessionIsStaff();
}

/**
 * Authorize an operator/admin API request. True if the legacy tp_admin password
 * cookie is valid OR the request carries a platform/operator tp_session
 * principal. `rawCookie` is the caller's tp_admin value; the tp_session is read
 * from the request cookie jar.
 */
export async function isAdminRequest(rawCookie: string | undefined): Promise<boolean> {
  if (adminCookieValid(rawCookie)) return true;
  return sessionIsStaff();
}
