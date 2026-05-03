import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { listAds } from "@/lib/meta-ads";

/**
 * GET /api/dashboard/campaigns/ads?campaignId=xxx
 *
 * Returns the ads under a campaign with creative info + per-ad
 * insights — drives the campaign drill-down on the Campaigns tab.
 *
 * If no campaignId provided, returns all ads in the connected ad
 * account (used by the already-promoted badge logic on the Promote
 * a Post tab).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const campaignId = new URL(req.url).searchParams.get("campaignId") || undefined;

  const rows = await sql`
    SELECT pa.asset_id, sa.access_token_encrypted
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${session.activeSiteId}
      AND pa.asset_type = 'meta_ad_account'
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY spa.is_primary DESC
    LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ ads: [] });

  const adAccountId = rows[0].asset_id as string;
  const accessToken = decrypt(rows[0].access_token_encrypted as string);

  try {
    const ads = await listAds(adAccountId, accessToken, campaignId);
    return NextResponse.json({ ads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
