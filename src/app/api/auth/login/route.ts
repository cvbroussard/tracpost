import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * POST /api/auth/login
 * Body: { api_key: "seo_..." }
 *
 * Validates the API key, sets a session cookie with subscriber + site info,
 * and returns subscriber details.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiKey = body.api_key;

  if (!apiKey) {
    return NextResponse.json({ error: "api_key is required" }, { status: 400 });
  }

  // Build a fake request with the Bearer header to reuse auth logic
  const fakeReq = new NextRequest(req.url, {
    headers: new Headers({ Authorization: `Bearer ${apiKey}` }),
  });

  const authResult = await authenticateRequest(fakeReq);
  if (authResult instanceof NextResponse) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  const auth = authResult as AuthContext;

  // Fetch subscriber's sites
  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${auth.subscriberId}
    ORDER BY created_at ASC
  `;

  // Session payload
  const session = {
    subscriberId: auth.subscriberId,
    subscriberName: auth.subscriberName,
    plan: auth.plan,
    apiKey, // stored in httpOnly cookie for API calls from dashboard
    sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url })),
    activeSiteId: sites[0]?.id || null,
  };

  const response = NextResponse.json({
    subscriber: {
      id: auth.subscriberId,
      name: auth.subscriberName,
      plan: auth.plan,
    },
    sites,
  });

  // Set httpOnly cookie
  response.cookies.set("seo_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
