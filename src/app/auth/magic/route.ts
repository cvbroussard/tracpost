import { NextRequest, NextResponse } from "next/server";
import { validateMagicToken } from "@/lib/magic-link";
import { sql } from "@/lib/db";
import { studioUrl, cookieDomain } from "@/lib/subdomains";

export const dynamic = "force-dynamic";

/**
 * GET /auth/magic?token=xxx
 *
 * Validates magic link token, creates session cookie, redirects to
 * setup wizard (new subscriber) or dashboard (returning).
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", req.url));
  }

  const subscriberId = await validateMagicToken(token);

  if (!subscriberId) {
    return NextResponse.redirect(new URL("/login?error=link_expired", req.url));
  }

  // Load subscriber + sites
  const [subscriber] = await sql`
    SELECT id, name, plan, email, metadata FROM subscribers WHERE id = ${subscriberId}
  `;

  if (!subscriber) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${subscriberId}
    ORDER BY created_at ASC
  `;

  // Build session
  const session = {
    subscriberId: subscriber.id,
    subscriberName: subscriber.name,
    plan: subscriber.plan,
    sites: sites.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      url: s.url,
    })),
    activeSiteId: sites[0]?.id || null,
  };

  // Determine redirect destination
  const meta = (subscriber.metadata || {}) as Record<string, unknown>;
  const onboardingStatus = meta.onboarding_status as string;
  const needsSetup = sites.length === 0 || onboardingStatus === "new";

  const redirectUrl = needsSetup
    ? new URL("/setup", req.url)
    : new URL(studioUrl("/") || "/dashboard", req.url);

  const response = NextResponse.redirect(redirectUrl);

  // Set session cookie on response
  response.cookies.set("tp_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    domain: cookieDomain(),
  });

  return response;
}
