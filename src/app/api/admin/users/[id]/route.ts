/**
 * PATCH /api/admin/users/[id]
 * Body: { is_active?: boolean }
 *
 * Operator-only. Activate/deactivate a user. Business assignment is managed via
 * memberships (scope_type='business'), NOT a raw users.business_id write — that
 * legacy column is slated for retirement.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [user] = await sql`SELECT id FROM users WHERE id = ${id}`;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const result: Record<string, unknown> = { ok: true };

  if (typeof body.is_active === "boolean") {
    await sql`UPDATE users SET is_active = ${body.is_active}, updated_at = NOW() WHERE id = ${id}`;
    result.is_active = body.is_active;
  }

  return NextResponse.json(result);
}
