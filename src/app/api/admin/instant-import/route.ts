/**
 * GET  /api/admin/instant-import?subscription_id=xxx
 *      → per-asset import status for the subscriber
 * POST /api/admin/instant-import
 *      → manually run pending imports across all subscribers (operator trigger)
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("subscription_id");
  const siteId = url.searchParams.get("site_id");
  if (!subscriptionId) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  // When a specific site is selected, scope to assets assigned to that site
  // only (orphans are a subscriber-level concern; surface them only when
  // the operator is in "all sites" view).
  const assets = siteId && siteId !== "all"
    ? await sql`
        SELECT pa.id, pa.platform, pa.asset_name, pa.health_status,
               pa.imported_at, pa.created_at,
               s.name AS primary_site_name,
               s.gbp_profile AS gbp_profile_snapshot,
               (SELECT COUNT(*)::int FROM historical_posts hp WHERE hp.platform_asset_id = pa.id) AS historical_count
        FROM platform_assets pa
        JOIN social_accounts sa ON sa.id = pa.social_account_id
        JOIN site_platform_assets spa ON spa.platform_asset_id = pa.id AND spa.is_primary = true
        JOIN sites s ON s.id = spa.site_id
        WHERE sa.subscription_id = ${subscriptionId}
          AND s.id = ${siteId}
        ORDER BY pa.platform, pa.asset_name
      `
    : await sql`
        SELECT pa.id, pa.platform, pa.asset_name, pa.health_status,
               pa.imported_at, pa.created_at,
               (SELECT s.name FROM site_platform_assets spa
                JOIN sites s ON s.id = spa.site_id
                WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
                LIMIT 1) AS primary_site_name,
               (SELECT s.gbp_profile FROM site_platform_assets spa
                JOIN sites s ON s.id = spa.site_id
                WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
                LIMIT 1) AS gbp_profile_snapshot,
               (SELECT COUNT(*)::int FROM historical_posts hp WHERE hp.platform_asset_id = pa.id) AS historical_count
        FROM platform_assets pa
        JOIN social_accounts sa ON sa.id = pa.social_account_id
        WHERE sa.subscription_id = ${subscriptionId}
        ORDER BY pa.platform, pa.asset_name
      `;

  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runInstantImports } = await import("@/lib/instant-import");
  const result = await runInstantImports();
  return NextResponse.json(result);
}
