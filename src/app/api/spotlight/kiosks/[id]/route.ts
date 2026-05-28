import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * DELETE /api/spotlight/kiosks/[id] — Deactivate a kiosk
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Verify ownership through site
  const [kiosk] = await sql`
    SELECT k.id FROM spotlight_kiosks k
    JOIN businesses s ON s.id = k.business_id
    WHERE k.id = ${id} AND s.billing_account_id = ${auth.subscriptionId}
  `;

  if (!kiosk) return NextResponse.json({ error: "Kiosk not found" }, { status: 404 });

  await sql`UPDATE spotlight_kiosks SET is_active = false WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}
