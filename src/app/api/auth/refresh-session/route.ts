import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sql } from "@/lib/db";
import { cookieDomain } from "@/lib/subdomains";

/**
 * POST /api/auth/refresh-session
 *
 * Re-fetches subscriber data and updates the session cookie.
 * Used after creating a site so the session includes the new site.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${session.subscriberId} AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  const updated = {
    subscriberId: session.subscriberId,
    subscriberName: session.subscriberName,
    plan: session.plan,
    sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url })),
    activeSiteId: sites.find((s) => s.id === session.activeSiteId) ? session.activeSiteId : sites[0]?.id || null,
  };

  const response = NextResponse.json({ ok: true });

  const domain = cookieDomain();
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
