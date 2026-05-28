import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";

export interface Session {
  userId: string;
  userName: string;
  subscriptionId: string;
  subscriptionName: string;
  plan: string;
  role: string;
  /** v3, baked at session creation. Absent on legacy cookies — readers fall back
   *  to deriving from `role` during the rollover. */
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
 * Effective role string for display/gating, reconstructed from the v3 cookie
 * fields (isOwner + capability). Falls back to the legacy `role` field for
 * sessions issued before the v3 cookie bump (Phase 3b). Returns the legacy
 * vocabulary: "owner" | "capture" | "reviewer" | "member".
 */
export function sessionDisplayRole(s: Session): string {
  const isOwner = s.isOwner ?? ((s.role || "owner") === "owner");
  if (isOwner) return "owner";
  const cap = s.capability ?? (s.role === "capture" ? "capture" : s.role === "reviewer" ? "reviewer" : "full");
  if (cap === "capture") return "capture";
  if (cap === "reviewer") return "reviewer";
  return "member";
}
