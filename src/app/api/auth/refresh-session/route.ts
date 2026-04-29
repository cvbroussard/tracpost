import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sql } from "@/lib/db";
import { cookieDomain } from "@/lib/subdomains";
import { signCookie } from "@/lib/cookie-sign";

/**
 * POST /api/auth/refresh-session
 *
 * Re-fetches user/subscription data and updates the session cookie.
 * Used after creating a site so the session includes the new site.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sites = await sql`
    SELECT id, name, url, is_active FROM sites
    WHERE subscription_id = ${session.subscriptionId}
    ORDER BY is_active DESC, created_at ASC
  `;

  const updated = {
    userId: session.userId,
    userName: session.userName,
    subscriptionId: session.subscriptionId,
    subscriptionName: session.subscriptionName || session.userName,
    plan: session.plan,
    role: session.role || "owner",
    sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url, is_active: s.is_active !== false })),
    activeSiteId: sites.find((s) => s.id === session.activeSiteId) ? session.activeSiteId : sites[0]?.id || null,
  };

  const response = NextResponse.json({ ok: true });

  const domain = cookieDomain();
  response.cookies.set("tp_session", signCookie(updated), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(domain && { domain }),
  });

  return response;
}
