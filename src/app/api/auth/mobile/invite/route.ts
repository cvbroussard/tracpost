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
    SELECT tm.id, tm.subscriber_id, tm.site_id, tm.name, tm.role,
           tm.invite_expires, tm.invite_consumed, tm.is_active,
           sub.plan
    FROM team_members tm
    JOIN subscribers sub ON tm.subscriber_id = sub.id
    WHERE tm.invite_token = ${token}
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
    UPDATE team_members
    SET invite_consumed = true,
        session_token_hash = ${sessionHash},
        session_issued_at = NOW(),
        last_active_at = NOW()
    WHERE id = ${member.id}
  `;

  // Fetch sites for this subscriber (filtered by site scope if set)
  const sites = member.site_id
    ? await sql`
        SELECT id, name, url FROM sites
        WHERE id = ${member.site_id} AND deleted_at IS NULL
      `
    : await sql`
        SELECT id, name, url FROM sites
        WHERE subscriber_id = ${member.subscriber_id} AND deleted_at IS NULL
        ORDER BY created_at ASC
      `;

  return NextResponse.json({
    session_token: sessionToken,
    user: {
      id: member.id,
      subscriberId: member.subscriber_id,
      name: member.name,
      role: member.role,
      siteId: member.site_id || null,
      plan: member.plan,
    },
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url || "",
    })),
  });
}
