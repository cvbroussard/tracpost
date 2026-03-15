import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Validates credentials, sets a session cookie with subscriber + site info.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const rows = await sql`
    SELECT id, name, plan, password_hash
    FROM subscribers
    WHERE email = ${email}
      AND is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const subscriber = rows[0];

  if (!subscriber.password_hash) {
    return NextResponse.json({ error: "Password not set — contact admin" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, subscriber.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Fetch subscriber's sites
  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${subscriber.id}
    ORDER BY created_at ASC
  `;

  // Session payload — no API key stored
  const session = {
    subscriberId: subscriber.id,
    subscriberName: subscriber.name,
    plan: subscriber.plan,
    sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url })),
    activeSiteId: sites[0]?.id || null,
  };

  const response = NextResponse.json({
    subscriber: {
      id: subscriber.id,
      name: subscriber.name,
      plan: subscriber.plan,
    },
    sites,
  });

  response.cookies.set("seo_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
