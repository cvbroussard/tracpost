import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { listCampaigns, getCampaignInsights } from "@/lib/meta-ads";

/**
 * GET /api/dashboard/campaigns/list
 *
 * Calls Marketing API: lists all campaigns under the ad account assigned
 * to the active site, with lifetime insights per campaign.
 *
 * Returns []  if no ad account is connected (UI shows the connect CTA
 * via /ad-account endpoint).
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  // Find the ad account + the OAuth grant's encrypted token
  const rows = await sql`
    SELECT pa.asset_id, sa.access_token_encrypted
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
    return NextResponse.json({ campaigns: [] });
  }

  const adAccountId = rows[0].asset_id as string;
  const accessToken = decrypt(rows[0].access_token_encrypted as string);

  try {
    const campaigns = await listCampaigns(adAccountId, accessToken);
    // Fetch insights in parallel; tolerate per-campaign failures
    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        try {
          const insights = await getCampaignInsights(c.id, accessToken);
          return { ...c, insights };
        } catch {
          return {
            ...c,
            insights: {
              spend: "0", impressions: "0", clicks: "0",
              reach: "0", cpc: "0", cpm: "0", ctr: "0",
            },
          };
        }
      })
    );
    return NextResponse.json({ campaigns: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
