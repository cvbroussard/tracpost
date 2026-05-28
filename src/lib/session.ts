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
