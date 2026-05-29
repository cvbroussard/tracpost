import { NextRequest, NextResponse } from "next/server";
import { validateMagicToken } from "@/lib/magic-link";
import { sql } from "@/lib/db";
import { studioUrl, platformUrl, opsUrl, cookieDomain } from "@/lib/subdomains";
import { signCookie } from "@/lib/cookie-sign";
import { derivePrincipal, loadMemberships } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /auth/magic?token=xxx
 *
 * Validates magic link token, creates session cookie, redirects to dashboard.
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", req.url));
  }

  const subscriber = await validateMagicToken(token);

  if (!subscriber) {
    return NextResponse.redirect(new URL("/login?error=link_expired", req.url));
  }

  // Capture-only users can't access web (capability on the business membership;
  // users.role is being retired)
  if (subscriber.capability === "capture") {
    return NextResponse.redirect(new URL("/login?error=mobile_only", req.url));
  }

  const [subRows, siteRows, principalType] = await Promise.all([
    sql`SELECT name, owner_user_id FROM accounts WHERE id = ${subscriber.subscriptionId}`,
    sql`SELECT id, name, url, is_active FROM businesses WHERE billing_account_id = ${subscriber.subscriptionId} ORDER BY is_active DESC, created_at ASC`,
    loadMemberships(subscriber.id).then(derivePrincipal),
  ]);

  // Build session
  const session = {
    userId: subscriber.id,
    userName: subscriber.name,
    subscriptionId: subscriber.subscriptionId,
    subscriptionName: (subRows[0]?.name as string) || subscriber.name,
    plan: subscriber.plan,
    isOwner: subscriber.id === (subRows[0]?.owner_user_id as string | undefined),
    capability: subscriber.capability,
    principalType,
    sites: siteRows.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      is_active: s.is_active !== false,
    })),
    activeSiteId: null,
  };

  const redirectUrl =
    principalType === "platform"
      ? new URL(platformUrl("/"), req.url)
      : principalType === "operator"
        ? new URL(opsUrl("/"), req.url)
        : siteRows.length === 0
          ? new URL("/setup", req.url)
          : new URL(studioUrl("/") || "/dashboard", req.url);

  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set("tp_session", signCookie(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    domain: cookieDomain(),
  });

  // Clear onboarding-token cookie — visitor has authenticated into studio,
  // marketing pages should render normally for them again.
  response.cookies.set("tp_onboarding_token", "", { maxAge: 0, path: "/" });

  return response;
}
