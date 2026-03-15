import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/auth/session
 *
 * Returns the current session info including apiKey for client-side API calls.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    subscriberId: session.subscriberId,
    subscriberName: session.subscriberName,
    plan: session.plan,
    apiKey: session.apiKey,
    activeSiteId: session.activeSiteId,
    sites: session.sites,
  });
}
