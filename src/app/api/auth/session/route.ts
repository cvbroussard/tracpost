import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/auth/session
 *
 * Returns current session info (no API key — that's for external API auth only).
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
    activeSiteId: session.activeSiteId,
    sites: session.sites,
  });
}
