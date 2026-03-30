import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * GET /api/dashboard/team
 * List all team members for the subscriber.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const members = await sql`
    SELECT id, name, email, phone, role, site_id, invite_method,
           invite_consumed, last_active_at, is_active, created_at,
           invite_token, invite_expires
    FROM team_members
    WHERE subscriber_id = ${session.subscriberId}
    ORDER BY
      CASE role WHEN 'owner' THEN 0 WHEN 'engagement' THEN 1 WHEN 'capture' THEN 2 ELSE 3 END,
      created_at ASC
  `;

  return NextResponse.json({ members });
}

/**
 * POST /api/dashboard/team
 * Create a team member with email/password login + magic link.
 * Body: { name, role, email, password, siteId?, phone? }
 *
 * Creates a sub-subscriber record (for email/password login) and a
 * team_member record (for role/site scope + magic link). Both auth
 * methods work automatically — email/password for desktop, magic link
 * for mobile app onboarding.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, role, email, password, siteId, phone } = body;

  if (!name || !role || !email || !password) {
    return NextResponse.json({ error: "name, role, email, and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  if (!["owner", "engagement", "capture"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check for existing email
  const [existingEmail] = await sql`SELECT id FROM subscribers WHERE email = ${email}`;
  if (existingEmail) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  // Check plan limits
  const [sub] = await sql`SELECT plan FROM subscribers WHERE id = ${session.subscriberId}`;
  const plan = (sub?.plan as string) || "free";
  const currentCount = await sql`
    SELECT COUNT(*)::int AS count FROM team_members
    WHERE subscriber_id = ${session.subscriberId} AND is_active = true
  `;
  const count = currentCount[0]?.count || 0;
  const limit = plan === "pro" || plan === "authority" ? 5 : 1;

  if (count >= limit) {
    return NextResponse.json(
      { error: `Plan limit reached (${count}/${limit} users). Upgrade for more.` },
      { status: 403 }
    );
  }

  // Create sub-subscriber record for email/password login
  const passwordHash = await bcrypt.hash(password, 10);
  const apiKeyHash = crypto.createHash("sha256").update(`team-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`).digest("hex");

  const [newSub] = await sql`
    INSERT INTO subscribers (name, email, password_hash, api_key_hash, plan, is_active, metadata)
    VALUES (
      ${name}, ${email}, ${passwordHash}, ${apiKeyHash}, ${plan}, true,
      ${JSON.stringify({ parent_subscriber_id: session.subscriberId, role })}::jsonb
    )
    RETURNING id
  `;

  // Link sub-subscriber to the same sites as the parent
  const parentSites = await sql`SELECT id FROM sites WHERE subscriber_id = ${session.subscriberId}`;
  // For now, set active site to the specified site or the first available
  const activeSite = siteId || (parentSites[0]?.id as string) || null;
  if (activeSite) {
    await sql`
      UPDATE subscribers
      SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{active_site_id}', ${JSON.stringify(activeSite)}::jsonb)
      WHERE id = ${newSub.id}
    `;
  }

  // Generate magic link token
  const inviteToken = crypto.randomBytes(32).toString("base64url");
  const inviteExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  // Create team_member record for role/scope + magic link
  const [member] = await sql`
    INSERT INTO team_members (subscriber_id, site_id, name, email, phone, role, invite_token, invite_method, invite_expires)
    VALUES (
      ${session.subscriberId},
      ${siteId || null},
      ${name},
      ${email},
      ${phone || null},
      ${role},
      ${inviteToken},
      'qr',
      ${inviteExpires}
    )
    RETURNING id, name, role, invite_token, invite_expires
  `;

  // Send SMS invite if phone provided
  if (phone) {
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
      const inviteUrl = `https://tracpost.com/invite/${inviteToken}`;

      if (twilioSid && twilioAuth && twilioFrom) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            To: phone,
            From: twilioFrom,
            Body: `${session.subscriberName} added you to TracPost. Log in at studio.tracpost.com with your email, or tap for the mobile app: ${inviteUrl}`,
          }),
        });
      }
    } catch (err) {
      console.error("SMS invite failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ member, subscriber_id: newSub.id });
}
