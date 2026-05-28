import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/dashboard/sites/update-accounts
 * Body: { siteId, existingAccounts: string[] }
 *
 * Update existing accounts list on a site. Only allowed while
 * provisioning_status = 'requested' (before admin starts work).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { siteId, existingAccounts } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Verify ownership and that provisioning hasn't started
  const [site] = await sql`
    SELECT id, metadata FROM businesses
    WHERE id = ${siteId}
      AND billing_account_id = ${session.subscriptionId}
      AND provisioning_status = 'requested'
      AND is_active = true
  `;

  if (!site) {
    return NextResponse.json(
      { error: "Site not found or provisioning already in progress" },
      { status: 404 }
    );
  }

  const currentMeta = (site.metadata || {}) as Record<string, unknown>;
  const updatedMeta = {
    ...currentMeta,
    existing_accounts: Array.isArray(existingAccounts) ? existingAccounts : [],
  };

  await sql`
    UPDATE businesses
    SET metadata = ${JSON.stringify(updatedMeta)}::jsonb, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ ok: true });
}
