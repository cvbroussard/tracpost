import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/account/profile
 * Update subscriber name.
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  await sql`
    UPDATE subscribers SET name = ${name}, updated_at = NOW()
    WHERE id = ${auth.subscriberId}
  `;

  return NextResponse.json({ ok: true });
}
