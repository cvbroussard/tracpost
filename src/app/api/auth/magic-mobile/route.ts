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

  const subscriber = await validateMagicToken(token);

  if (!subscriber) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const sites = await sql`
    SELECT id, name, url, is_active FROM businesses
    WHERE billing_account_id = ${subscriber.subscriptionId}
    ORDER BY is_active DESC, created_at ASC
  `;

  // Generate session token for mobile app
  const sessionToken = await createSessionToken(subscriber.id);

  return NextResponse.json({
    session_token: sessionToken,
    subscriber: {
      id: subscriber.id,
      name: subscriber.name,
      plan: subscriber.plan,
      role: subscriber.isOwner
        ? "owner"
        : subscriber.capability === "capture"
          ? "capture"
          : subscriber.capability === "reviewer"
            ? "reviewer"
            : "member",
    },
    sites: sites.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      is_active: s.is_active !== false,
    })),
  });
}
