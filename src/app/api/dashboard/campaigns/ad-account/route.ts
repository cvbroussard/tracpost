import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/dashboard/campaigns/ad-account
 *
 * Returns the Meta ad account assigned to the active site, if any.
 * Drives the campaigns page header. If no ad account is connected,
 * returns connected:false so the UI can show the "Authorize Ad
 * Management" CTA.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const rows = await sql`
    SELECT pa.id, pa.asset_id, pa.asset_name, pa.metadata
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${session.activeSiteId}
      AND pa.asset_type = 'meta_ad_account'
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY spa.is_primary DESC, pa.created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ connected: false });
  }

  const row = rows[0];
  const metadata = (row.metadata || {}) as Record<string, unknown>;
  return NextResponse.json({
    connected: true,
    adAccount: {
      platformAssetId: row.id,
      id: row.asset_id,
      name: row.asset_name,
      accountId: metadata.account_id ?? null,
      currency: metadata.currency ?? "USD",
      status: metadata.status ?? null,
      amountSpent: metadata.amount_spent ?? "0",
    },
  });
}
