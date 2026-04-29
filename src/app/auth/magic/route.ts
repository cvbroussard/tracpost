import { NextRequest, NextResponse } from "next/server";
import { validateMagicToken } from "@/lib/magic-link";
import { sql } from "@/lib/db";
import { studioUrl, cookieDomain } from "@/lib/subdomains";
import { signCookie } from "@/lib/cookie-sign";

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

  // Capture-only users can't access web
  if (subscriber.role === "capture") {
    return NextResponse.redirect(new URL("/login?error=mobile_only", req.url));
  }

  const [subRows, siteRows] = await Promise.all([
    sql`SELECT name FROM subscriptions WHERE id = ${subscriber.subscriptionId}`,
    sql`SELECT id, name, url, is_active FROM sites WHERE subscription_id = ${subscriber.subscriptionId} ORDER BY is_active DESC, created_at ASC`,
  ]);

  // Build session
  const session = {
    userId: subscriber.id,
    userName: subscriber.name,
    subscriptionId: subscriber.subscriptionId,
    subscriptionName: (subRows[0]?.name as string) || subscriber.name,
    plan: subscriber.plan,
    role: subscriber.role,
    sites: siteRows.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      is_active: s.is_active !== false,
    })),
    activeSiteId: null,
  };

  const redirectUrl = siteRows.length === 0
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
