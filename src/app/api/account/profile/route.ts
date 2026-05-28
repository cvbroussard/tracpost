import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/account/profile
 * Update subscription name and/or user profile.
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, subscriptionName, ownerName, phone, companyPhone, email } = body;
  const bizName = subscriptionName || name;

  if (bizName) {
    await sql`
      UPDATE accounts SET name = ${bizName}, updated_at = NOW()
      WHERE id = ${auth.subscriptionId}
    `;
  }

  if (companyPhone !== undefined) {
    await sql`
      UPDATE businesses SET business_phone = ${companyPhone || null}, updated_at = NOW()
      WHERE billing_account_id = ${auth.subscriptionId}
    `;
  }

  if (ownerName) {
    await sql`
      UPDATE users SET name = ${ownerName}
      WHERE id = ${auth.userId}
    `;
  }

  if (phone !== undefined) {
    await sql`
      UPDATE users SET phone = ${phone || null}
      WHERE id = ${auth.userId}
    `;
  }

  // Self-edit email — uniqueness collision check excluding the current user.
  // Auth scope is already constrained to auth.userId, so users can only
  // change their own email, never anyone else's.
  if (email !== undefined && typeof email === "string" && email.trim()) {
    const newEmail = email.trim();
    const [collision] = await sql`
      SELECT id FROM users WHERE email = ${newEmail} AND id != ${auth.userId}
    `;
    if (collision) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    await sql`UPDATE users SET email = ${newEmail} WHERE id = ${auth.userId}`;
  }

  return NextResponse.json({ ok: true });
}
