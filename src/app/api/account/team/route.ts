import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

/**
 * POST /api/account/team — Add a team member (creates a user under the subscription)
 * Body: { name, email, role, siteId?, password? }
 *
 * If password is provided, sets it directly on the new user. Useful
 * for creating reviewer accounts with known credentials to hand to
 * Meta. If omitted, the standard magic-link invite flow handles
 * first-time sign-in.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  if (!auth.isOwner) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const { name, email, role, siteId, password } = await req.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  if (!["member", "capture", "reviewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (password !== undefined && password !== null && password !== "" && password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // v3: capability lives on a business membership. Capture/reviewer must be
  // scoped to a business (option A); default to the account's sole business.
  const capability = role === "capture" ? "capture" : role === "reviewer" ? "reviewer" : "full";
  let scopeBiz: string | null = siteId || null;
  if (!scopeBiz) {
    const bizRows = await sql`SELECT id FROM businesses WHERE billing_account_id = ${auth.subscriptionId} AND is_active = true`;
    if (bizRows.length === 1) scopeBiz = bizRows[0].id as string;
  }
  if ((role === "capture" || role === "reviewer") && !scopeBiz) {
    return NextResponse.json({ error: "Select a site for capture or reviewer members." }, { status: 400 });
  }

  // Check if email already exists
  const [existing] = await sql`
    SELECT id FROM users WHERE email = ${email}
  `;
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : null;

  // Create team member user under the current subscription
  const [member] = await sql`
    INSERT INTO users (name, email, role, billing_account_id, business_id, is_active, password_hash)
    VALUES (${name.trim()}, ${email.trim()}, ${role}, ${auth.subscriptionId}, ${siteId || null}, true, ${passwordHash})
    RETURNING id, name, email, role, business_id
  `;

  // Mirror the role onto a business membership (the v3 source of truth; the
  // users.role write above is legacy dual-write, retired in Phase 4).
  if (scopeBiz) {
    await sql`
      INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
      VALUES (${member.id}, 'business', ${scopeBiz}, 'member', ${capability})
      ON CONFLICT DO NOTHING
    `;
  }

  // Send magic link invite for web-eligible roles when no password was set.
  // If owner set a password directly (reviewer flow), skip the invite —
  // the credentials are handed off out-of-band.
  if (role !== "capture" && !password) {
    try {
      const { generateMagicToken } = await import("@/lib/magic-link");
      const { sendWelcomeEmail } = await import("@/lib/email");
      const token = await generateMagicToken(member.id as string);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.NODE_ENV === "production" ? "https://studio.tracpost.com" : "http://localhost:3000");
      const magicUrl = `${baseUrl}/auth/magic?token=${token}`;
      await sendWelcomeEmail(email.trim(), magicUrl, true);
    } catch (err) {
      console.error("Failed to send invite email:", err);
      // Member was created — don't fail the request
    }
  }

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      siteId: member.business_id || null,
    },
  });
}
