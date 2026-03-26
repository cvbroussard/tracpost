import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/account/profile
 * Update subscriber name and/or phone.
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, phone } = body;

  if (name) {
    await sql`
      UPDATE subscribers SET name = ${name}, updated_at = NOW()
      WHERE id = ${auth.subscriberId}
    `;
    // Also update owner team member name
    await sql`
      UPDATE team_members SET name = ${name}
      WHERE subscriber_id = ${auth.subscriberId} AND role = 'owner'
    `;
  }

  if (phone !== undefined) {
    // Phone stored on owner team member
    await sql`
      UPDATE team_members SET phone = ${phone || null}
      WHERE subscriber_id = ${auth.subscriberId} AND role = 'owner'
    `;
  }

  return NextResponse.json({ ok: true });
}
