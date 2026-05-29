import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

/**
 * PATCH /api/account/team/:id — Update a team member
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  if (!auth.isOwner) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const [member] = await sql`
    SELECT id FROM users
    WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined && typeof body.name === "string" && body.name.trim()) {
    await sql`UPDATE users SET name = ${body.name.trim()} WHERE id = ${id}`;
  }

  if (body.email !== undefined && typeof body.email === "string" && body.email.trim()) {
    const newEmail = body.email.trim();
    // Uniqueness collision check — prevent owners from renaming a
    // member to an email that already belongs to another user.
    const [collision] = await sql`
      SELECT id FROM users WHERE email = ${newEmail} AND id != ${id}
    `;
    if (collision) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    await sql`UPDATE users SET email = ${newEmail} WHERE id = ${id}`;
  }

  if (body.phone !== undefined && typeof body.phone === "string") {
    await sql`UPDATE users SET phone = ${body.phone.trim() || null} WHERE id = ${id}`;
  }

  // Site scope + capability both live on the member's business membership now
  // (users.business_id retired). Resolve the target scope + capability and
  // upsert the member's single business membership.
  const roleChange = body.role !== undefined && ["member", "capture", "reviewer"].includes(body.role);
  if (body.siteId !== undefined || roleChange) {
    const [existing] = await sql`
      SELECT id, scope_id, capability FROM memberships
      WHERE user_id = ${id} AND scope_type = 'business'
      ORDER BY created_at LIMIT 1
    `;

    // Capability: explicit role wins; else keep existing; else 'full'.
    const capability = body.role === "capture" ? "capture"
      : body.role === "reviewer" ? "reviewer"
      : body.role === "member" ? "full"
      : (existing?.capability as string | null) || "full";

    // Target business: explicit siteId wins (null clears scope); else keep the
    // existing membership's scope; else the account's sole active business.
    let scopeBiz: string | null =
      body.siteId !== undefined ? (body.siteId || null)
      : (existing?.scope_id as string | null) || null;
    if (!scopeBiz && body.siteId === undefined && !existing) {
      const bizRows = await sql`SELECT id FROM businesses WHERE billing_account_id = ${auth.subscriptionId} AND is_active = true`;
      if (bizRows.length === 1) scopeBiz = bizRows[0].id as string;
    }

    if ((capability === "capture" || capability === "reviewer") && !scopeBiz) {
      return NextResponse.json({ error: "Select a site for capture or reviewer members." }, { status: 400 });
    }

    if (existing) {
      if (scopeBiz) {
        await sql`
          UPDATE memberships SET scope_id = ${scopeBiz}, capability = ${capability}
          WHERE id = ${existing.id}
        `;
      } else {
        // Scope explicitly cleared + capability full → unscope (all-sites member).
        await sql`DELETE FROM memberships WHERE id = ${existing.id}`;
      }
    } else if (scopeBiz) {
      await sql`
        INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
        VALUES (${id}, 'business', ${scopeBiz}, 'member', ${capability})
      `;
    }
  }

  if (body.notifyVia !== undefined && ["email", "sms", "both"].includes(body.notifyVia)) {
    await sql`UPDATE users SET notify_via = ${body.notifyVia} WHERE id = ${id}`;
  }

  if (body.password !== undefined && typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const hash = await bcrypt.hash(body.password, 12);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
  }

  return NextResponse.json({ success: true });
}

/**
 * POST /api/account/team/:id — Send invite (email and/or SMS)
 * Body: { channel: "email" | "sms" | "both" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  if (!auth.isOwner) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const [member] = await sql`
    SELECT id, email, phone, name FROM users
    WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId} AND is_active = true
  `;
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await req.json();
  const channel = body.channel || "email";

  // Generate magic link
  const { generateMagicToken } = await import("@/lib/magic-link");
  const token = await generateMagicToken(id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.NODE_ENV === "production" ? "https://studio.tracpost.com" : "http://localhost:3000");
  const magicUrl = `${baseUrl}/auth/magic?token=${token}`;

  const results: { email?: boolean; sms?: boolean } = {};

  // Send email
  if ((channel === "email" || channel === "both") && member.email) {
    const { sendWelcomeEmail } = await import("@/lib/email");
    results.email = await sendWelcomeEmail(member.email as string, magicUrl, false);
  }

  // SMS invites disabled — A2P 10DLC compliance prohibits SMS to a recipient
  // before they've explicitly opted in. Team members can opt into SMS from
  // their settings page after first sign-in. The "sms" / "both" channel
  // values stay accepted for forward compatibility but only email is sent.
  results.sms = false;

  return NextResponse.json({ sent: results });
}

/**
 * DELETE /api/account/team/:id — Remove a team member
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  if (!auth.isOwner) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  await sql`
    UPDATE users
    SET is_active = false, session_token_hash = NULL
    WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
