import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/dashboard/campaigns/ad-accounts
 *
 * Returns ALL ad accounts the subscription's OAuth grant has access
 * to (across any Business Manager the authorizing user belongs to).
 * Drives the picker dropdown at the top of the Meta Ads page.
 *
 * Each account includes status, currency, lifetime spend, and a flag
 * indicating whether it's the current primary (default) for the
 * active Business.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  // Pull all meta_ad_account assets for this subscription, plus mark
  // which ones are assigned to the active Business as primary.
  const rows = await sql`
    SELECT
      pa.id            AS platform_asset_id,
      pa.asset_id      AS account_full_id,
      pa.asset_name    AS account_name,
      pa.metadata,
      EXISTS(
        SELECT 1 FROM site_platform_assets spa
        WHERE spa.platform_asset_id = pa.id
          AND spa.site_id = ${session.activeSiteId}
          AND spa.is_primary = true
      ) AS is_primary,
      EXISTS(
        SELECT 1 FROM site_platform_assets spa
        WHERE spa.platform_asset_id = pa.id
          AND spa.site_id = ${session.activeSiteId}
      ) AS is_assigned
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.asset_type = 'meta_ad_account'
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY is_primary DESC, pa.created_at ASC
  `;

  const accounts = rows.map((row) => {
    const md = (row.metadata || {}) as Record<string, unknown>;
    return {
      platformAssetId: row.platform_asset_id,
      id: row.account_full_id,                              // act_xxx
      accountId: md.account_id ?? null,                     // numeric id without act_
      name: row.account_name,
      currency: md.currency ?? "USD",
      status: md.status ?? null,                            // numeric account_status from Meta
      amountSpent: md.amount_spent ?? "0",
      isPrimary: row.is_primary === true,
      isAssigned: row.is_assigned === true,
    };
  });

  return NextResponse.json({ accounts });
}
