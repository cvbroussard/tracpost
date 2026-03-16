import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * POST /api/notifications/register
 * Register a device push token for the authenticated subscriber.
 * Body: { token: string, platform?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { token, platform } = body as {
    token?: string;
    platform?: string;
  };

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "token is required" },
      { status: 400 }
    );
  }

  const devicePlatform = platform || "expo";

  // Upsert: if token already exists, update subscriber_id
  await sql`
    INSERT INTO push_tokens (subscriber_id, token, platform)
    VALUES (${auth.subscriberId}, ${token}, ${devicePlatform})
    ON CONFLICT (token)
    DO UPDATE SET subscriber_id = ${auth.subscriberId}, platform = ${devicePlatform}
  `;

  return NextResponse.json({ ok: true });
}
