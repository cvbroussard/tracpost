import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookieDomain } from "@/lib/subdomains";
import { createSessionToken } from "@/lib/auth";
import { signCookie } from "@/lib/cookie-sign";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Validates credentials, sets a session cookie with user + subscription info.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const rows = await sql`
    SELECT u.id, u.name, u.role, u.password_hash, u.subscription_id,
           s.plan, s.name AS subscription_name
    FROM users u
    JOIN subscriptions s ON u.subscription_id = s.id
    WHERE u.email = ${email}
      AND u.is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = rows[0];

  if (!user.password_hash) {
    return NextResponse.json({ error: "Password not set. If you haven't finished onboarding, check your email for the sign-in link to complete it. Otherwise contact admin." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Capture-only users cannot access the web dashboard
  const role = (user.role as string) || "owner";
  if (role === "capture") {
    return NextResponse.json(
      { error: "This account is mobile-only. Use the TracPost Studio app instead." },
      { status: 403 }
    );
  }

  const subscriptionId = user.subscription_id as string;

  const sites = await sql`
    SELECT id, name, url, is_active FROM sites
    WHERE subscription_id = ${subscriptionId}
    ORDER BY is_active DESC, created_at ASC
  `;

  // Auto-select on single-site subscriptions: there's no ambiguity, no reason
  // to make the subscriber click. Multi-site subscribers still pick explicitly
  // from the dashboard tile or breadcrumb dropdown.
  const activeSiteId = sites.length === 1 ? (sites[0].id as string) : null;

  // Session payload — no API key stored
  const session = {
    userId: user.id,
    userName: user.name,
    subscriptionId,
    subscriptionName: user.subscription_name || user.name,
    plan: user.plan,
    role,
    sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url, is_active: s.is_active !== false })),
    activeSiteId,
  };

  // Generate session token for native app clients
  const sessionToken = await createSessionToken(user.id);

  const response = NextResponse.json({
    subscriber: {
      id: user.id,
      name: user.name,
      plan: user.plan,
    },
    sites,
    session_token: sessionToken, // For native app — store in SecureStore
  });

  const domain = cookieDomain();
  response.cookies.set("tp_session", signCookie(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    ...(domain && { domain }),
  });

  // Clear onboarding-token cookie — user has authenticated into studio,
  // marketing pages should render normally for them again.
  response.cookies.set("tp_onboarding_token", "", { maxAge: 0, path: "/" });

  return response;
}
