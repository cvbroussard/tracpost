import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

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

  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const [member] = await sql`
    SELECT id FROM users
    WHERE id = ${id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined && typeof body.name === "string" && body.name.trim()) {
    await sql`UPDATE users SET name = ${body.name.trim()} WHERE id = ${id}`;
  }

  if (body.email !== undefined && typeof body.email === "string" && body.email.trim()) {
    await sql`UPDATE users SET email = ${body.email.trim()} WHERE id = ${id}`;
  }

  if (body.phone !== undefined && typeof body.phone === "string") {
    await sql`UPDATE users SET phone = ${body.phone.trim() || null} WHERE id = ${id}`;
  }

  if (body.siteId !== undefined) {
    await sql`UPDATE users SET site_id = ${body.siteId || null} WHERE id = ${id}`;
  }

  if (body.role !== undefined && ["member", "capture"].includes(body.role)) {
    await sql`UPDATE users SET role = ${body.role} WHERE id = ${id}`;
  }

  if (body.notifyVia !== undefined && ["email", "sms", "both"].includes(body.notifyVia)) {
    await sql`UPDATE users SET notify_via = ${body.notifyVia} WHERE id = ${id}`;
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

  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const [member] = await sql`
    SELECT id, email, phone, name, role FROM users
    WHERE id = ${id} AND subscription_id = ${auth.subscriptionId} AND is_active = true
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

  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  await sql`
    UPDATE users
    SET is_active = false, session_token_hash = NULL
    WHERE id = ${id} AND subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
