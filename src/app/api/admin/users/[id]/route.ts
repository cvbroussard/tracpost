/**
 * PATCH /api/admin/users/[id]
 * Body: { is_active?: boolean, business_id?: string | null }
 *
 * Operator-only. Activate/deactivate a user and (re)point their legacy
 * business_id scope. business_id must belong to the user's own account —
 * no cross-account assignment.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req.cookies.get("tp_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [user] = await sql`SELECT id, billing_account_id FROM users WHERE id = ${id}`;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const result: Record<string, unknown> = { ok: true };

  if (typeof body.is_active === "boolean") {
    await sql`UPDATE users SET is_active = ${body.is_active}, updated_at = NOW() WHERE id = ${id}`;
    result.is_active = body.is_active;
  }

  if ("business_id" in body) {
    const bizId = (body.business_id as string | null) || null;
    if (bizId === null) {
      await sql`UPDATE users SET business_id = NULL, updated_at = NOW() WHERE id = ${id}`;
      result.business_id = null;
      result.business_name = null;
    } else {
      const [biz] = await sql`
        SELECT id, name FROM businesses
        WHERE id = ${bizId} AND billing_account_id = ${user.billing_account_id}
      `;
      if (!biz) {
        return NextResponse.json(
          { error: "Business not found under this user's account" },
          { status: 400 },
        );
      }
      await sql`UPDATE users SET business_id = ${bizId}, updated_at = NOW() WHERE id = ${id}`;
      result.business_id = biz.id;
      result.business_name = biz.name;
    }
  }

  return NextResponse.json(result);
}
