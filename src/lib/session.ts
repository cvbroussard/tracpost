import { cookies } from "next/headers";

export interface Session {
  subscriberId: string;
  subscriberName: string;
  plan: string;
  apiKey: string;
  sites: Array<{ id: string; name: string; url: string }>;
  activeSiteId: string | null;
}

/**
 * Read the subscriber session from the httpOnly cookie.
 * Returns null if not logged in.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("seo_session")?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
