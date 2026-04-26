/**
 * GET  /api/admin/platform-assets?subscription_id=xxx
 *      Returns all platform_assets accessible by any social_accounts row
 *      for the given subscriber, plus which sites each is assigned to.
 *
 * POST /api/admin/platform-assets/assign
 *      Body: { site_id, platform_asset_id, is_primary? }
 *      Assigns a site to an asset.
 *
 * DELETE /api/admin/platform-assets/assign
 *      Body: { site_id, platform_asset_id }
 *      Unassigns.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptionId = new URL(req.url).searchParams.get("subscription_id");
  if (!subscriptionId) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  const accounts = await sql`
    SELECT sa.id AS social_account_id, sa.platform, sa.account_name AS user_name,
           sa.status, sa.token_expires_at
    FROM social_accounts sa
    WHERE sa.subscription_id = ${subscriptionId}
    ORDER BY sa.platform, sa.created_at DESC
  `;

  const assets = await sql`
    SELECT pa.id, pa.social_account_id, pa.platform, pa.asset_type,
           pa.asset_id, pa.asset_name, pa.metadata,
           ARRAY(
             SELECT json_build_object(
               'site_id', spa.site_id,
               'site_name', s.name,
               'is_primary', spa.is_primary
             )
             FROM site_platform_assets spa
             JOIN sites s ON s.id = spa.site_id
             WHERE spa.platform_asset_id = pa.id
           ) AS assignments
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE sa.subscription_id = ${subscriptionId}
    ORDER BY pa.platform, pa.asset_type, pa.asset_name
  `;

  return NextResponse.json({ accounts, assets });
}
