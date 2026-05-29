import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import crypto from "crypto";

/**
 * POST /api/auth/mobile/invite
 * Body: { token }
 *
 * Redeem a team member invite token from the mobile app.
 * Validates the token, creates a device session, and returns
 * the user profile + sites for the mobile app to store.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // Find the invite
  const [member] = await sql`
    SELECT u.id, u.billing_account_id, u.name,
           u.invite_expires, u.invite_consumed, u.is_active,
           s.plan, s.owner_user_id,
           (SELECT capability FROM memberships WHERE user_id = u.id AND scope_type = 'business' ORDER BY created_at LIMIT 1) AS capability,
           (SELECT scope_id FROM memberships WHERE user_id = u.id AND scope_type = 'business' AND capability IN ('capture','reviewer') ORDER BY created_at LIMIT 1) AS scoped_business_id
    FROM users u
    JOIN accounts s ON u.billing_account_id = s.id
    WHERE u.invite_token = ${token}
  `;

  if (!member) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 404 });
  }

  if (!member.is_active) {
    return NextResponse.json({ error: "This invite has been revoked" }, { status: 403 });
  }

  if (member.invite_consumed) {
    return NextResponse.json({ error: "This invite has already been used" }, { status: 403 });
  }

  if (member.invite_expires && new Date(member.invite_expires as string) < new Date()) {
    return NextResponse.json({ error: "This invite has expired. Ask your team owner for a new one." }, { status: 403 });
  }

  // Generate device session token
  const sessionToken = crypto.randomBytes(64).toString("base64url");
  const sessionHash = crypto.createHash("sha256").update(sessionToken).digest("hex");

  // Mark invite as consumed + store session
  await sql`
    UPDATE users
    SET invite_consumed = true,
        session_token_hash = ${sessionHash},
        session_issued_at = NOW(),
        last_active_at = NOW()
    WHERE id = ${member.id}
  `;

  // Fetch sites for this subscriber (filtered by site scope if set)
  const sites = member.scoped_business_id
    ? await sql`
        SELECT id, name, url FROM businesses
        WHERE id = ${member.scoped_business_id} AND is_active = true
      `
    : await sql`
        SELECT id, name, url FROM businesses
        WHERE billing_account_id = ${member.billing_account_id} AND is_active = true
        ORDER BY created_at ASC
      `;

  return NextResponse.json({
    session_token: sessionToken,
    user: {
      id: member.id,
      subscriptionId: member.billing_account_id,
      name: member.name,
      role: member.capability === "capture"
        ? "capture"
        : member.capability === "reviewer"
          ? "reviewer"
          : member.id === member.owner_user_id
            ? "owner"
            : "member",
      siteId: member.scoped_business_id || null,
      plan: member.plan,
    },
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url || "",
    })),
  });
}
