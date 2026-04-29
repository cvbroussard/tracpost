import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";

export interface Session {
  userId: string;
  userName: string;
  subscriptionId: string;
  subscriptionName: string;
  plan: string;
  role: string;
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
