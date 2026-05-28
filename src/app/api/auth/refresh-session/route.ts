import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sql } from "@/lib/db";
import { cookieDomain } from "@/lib/subdomains";
import { signCookie } from "@/lib/cookie-sign";
import { derivePrincipal, loadMemberships } from "@/lib/auth";

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

  // Re-query the user to pick up any owner edits to site_id (Site Access)
  // since last login. Session caches go stale across permission changes
  // until refresh fires — this keeps reviewer scoping current.
  const [userRow] = await sql`
    SELECT u.business_id, a.owner_user_id,
           (SELECT capability FROM memberships WHERE user_id = u.id AND scope_type = 'business' ORDER BY created_at LIMIT 1) AS capability
    FROM users u LEFT JOIN accounts a ON a.id = u.billing_account_id
    WHERE u.id = ${session.userId}
  `;
  const userSiteScope = (userRow?.business_id as string | null) || null;

  const principalType = derivePrincipal(await loadMemberships(session.userId));

  // Accountless staff have no businesses — skip the uuid-typed lookup.
  const rawSites = session.subscriptionId
    ? await sql`
        SELECT id, name, url, is_active FROM businesses
        WHERE billing_account_id = ${session.subscriptionId}
        ORDER BY is_active DESC, created_at ASC
      `
    : [];
  const sites = userSiteScope
    ? rawSites.filter((s) => s.id === userSiteScope)
    : rawSites;

  const updated = {
    userId: session.userId,
    userName: session.userName,
    subscriptionId: session.subscriptionId,
    subscriptionName: session.subscriptionName || session.userName,
    plan: session.plan,
    isOwner: session.userId === (userRow?.owner_user_id as string | undefined),
    capability: (userRow?.capability as string | null) || null,
    principalType,
    sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url, is_active: s.is_active !== false })),
    // Active-aware fallback: if the previous activeSiteId points to an
    // inactive site (e.g. subscriber just deactivated their current
    // business), fall through to the first ACTIVE site rather than
    // keeping the stale inactive one.
    activeSiteId: (() => {
      const activeOnly = sites.filter((s) => s.is_active !== false);
      const current = activeOnly.find((s) => s.id === session.activeSiteId);
      return current ? session.activeSiteId : (activeOnly[0]?.id || null);
    })(),
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
