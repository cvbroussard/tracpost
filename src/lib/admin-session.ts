import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";

/**
 * Staff authorization for the admin/manage surfaces. A signed tp_session
 * carrying a platform or operator principal authorizes the request — the same
 * credential the canonical login bakes in. The legacy shared-secret tp_admin
 * cookie was retired in C2b; staff authenticate as real users now.
 */
async function sessionIsStaff(): Promise<boolean> {
  const jar = await cookies();
  const session = verifyCookie<{ principalType?: string }>(jar.get("tp_session")?.value);
  return session?.principalType === "platform" || session?.principalType === "operator";
}

/** Page / server-component guard: true for a platform/operator tp_session. */
export async function getAdminSession(): Promise<boolean> {
  return sessionIsStaff();
}

/** API-route guard: true for a platform/operator tp_session. */
export async function isAdminRequest(): Promise<boolean> {
  return sessionIsStaff();
}
