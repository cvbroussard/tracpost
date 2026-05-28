import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";

export interface Session {
  userId: string;
  userName: string;
  subscriptionId: string;
  subscriptionName: string;
  plan: string;
  /** v3, baked at session creation (Phase 3b). Absent on pre-3b cookies, which
   *  resolve to non-owner until the user re-logs in. */
  isOwner?: boolean;
  capability?: string | null;
  /** v3 surface this principal belongs to ("platform" | "operator" | "agency"
   *  | "business" | "guest"). Baked at session creation; gateAdmin reads it
   *  from the cookie to authorize staff into platform/operator surfaces
   *  without a separate tp_admin cookie. Absent on legacy cookies. */
  principalType?: string;
  sites: Array<{ id: string; name: string; url: string; is_active?: boolean }>;
  activeSiteId: string | null;
}

/**
 * Read the user session from the httpOnly cookie.
 * Returns null if not logged in or if the cookie HMAC is invalid (tampered/forged).
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("tp_session")?.value;
  return verifyCookie<Session>(raw);
}

/**
 * Effective role string for display/gating, derived from the v3 cookie fields
 * (isOwner + capability, baked since Phase 3b). Returns the display vocabulary:
 * "owner" | "capture" | "reviewer" | "member". Pre-3b cookies lacking these
 * fields resolve to "member" until the user re-logs in.
 */
export function sessionDisplayRole(s: Session): string {
  if (s.isOwner) return "owner";
  if (s.capability === "capture") return "capture";
  if (s.capability === "reviewer") return "reviewer";
  return "member";
}
