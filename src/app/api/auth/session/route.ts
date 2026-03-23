import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookieDomain } from "@/lib/subdomains";

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

/**
 * POST /api/auth/session
 * Body: { activeSiteId }
 *
 * Switch the active site in the session cookie.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { activeSiteId } = body;

  // Verify the site belongs to this subscriber
  const validSite = session.sites.find((s) => s.id === activeSiteId);
  if (!validSite) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const updated = { ...session, activeSiteId };

  const domain = cookieDomain();
  const response = NextResponse.json({ ok: true, activeSiteId });
  response.cookies.set("tp_session", JSON.stringify(updated), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(domain && { domain }),
  });

  return response;
}
