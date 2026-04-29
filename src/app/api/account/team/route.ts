import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/account/team — Add a team member (creates a user under the subscription)
 * Body: { name, email, role, siteId? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const { name, email, role, siteId } = await req.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  if (!["member", "capture"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check if email already exists
  const [existing] = await sql`
    SELECT id FROM users WHERE email = ${email}
  `;
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  // Create team member user under the current subscription
  const [member] = await sql`
    INSERT INTO users (name, email, role, subscription_id, site_id, is_active)
    VALUES (${name.trim()}, ${email.trim()}, ${role}, ${auth.subscriptionId}, ${siteId || null}, true)
    RETURNING id, name, email, role, site_id
  `;

  // Send magic link invite for web-eligible roles
  if (role !== "capture") {
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
      siteId: member.site_id || null,
    },
  });
}
