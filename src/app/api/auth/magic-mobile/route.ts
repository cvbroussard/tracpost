import { NextRequest, NextResponse } from "next/server";
import { validateMagicToken } from "@/lib/magic-link";
import { sql } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

/**
 * POST /api/auth/magic-mobile
 *
 * Mobile-specific magic link validation.
 * Returns session_token + subscriber + sites (same as login response).
 * Does NOT set cookies — mobile app stores the token in SecureStore.
 */
export async function POST(req: NextRequest) {
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const subscriberId = await validateMagicToken(token);

  if (!subscriberId) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const [subscriber] = await sql`
    SELECT id, name, plan, email FROM subscribers
    WHERE id = ${subscriberId} AND is_active = true
  `;

  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${subscriberId}
    ORDER BY created_at ASC
  `;

  // Generate session token for mobile app
  const sessionToken = await createSessionToken(subscriberId);

  return NextResponse.json({
    session_token: sessionToken,
    subscriber: {
      id: subscriber.id,
      name: subscriber.name,
      plan: subscriber.plan,
    },
    sites: sites.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      url: s.url,
    })),
  });
}
