/**
 * GET  /api/admin/asset-health
 *      Returns current health snapshot for all platform_assets, optionally
 *      filtered by subscription_id.
 *
 * POST /api/admin/asset-health
 *      Triggers a fresh health check across all assets, returns the new
 *      snapshot. Use sparingly — hits each platform's API.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptionId = new URL(req.url).searchParams.get("subscription_id");

  const rows = subscriptionId
    ? await sql`
        SELECT pa.id, pa.platform, pa.asset_name, pa.asset_id,
               pa.health_status, pa.health_checked_at, pa.health_error,
               sa.id AS social_account_id, sa.account_name AS user_name,
               sa.status AS account_status,
               (SELECT COUNT(*)::int FROM site_platform_assets WHERE platform_asset_id = pa.id) AS assigned_sites
        FROM platform_assets pa
        JOIN social_accounts sa ON sa.id = pa.social_account_id
        WHERE sa.subscription_id = ${subscriptionId}
        ORDER BY pa.health_status, pa.platform, pa.asset_name
      `
    : await sql`
        SELECT pa.id, pa.platform, pa.asset_name, pa.asset_id,
               pa.health_status, pa.health_checked_at, pa.health_error,
               sa.id AS social_account_id, sa.account_name AS user_name,
               sa.status AS account_status,
               (SELECT COUNT(*)::int FROM site_platform_assets WHERE platform_asset_id = pa.id) AS assigned_sites
        FROM platform_assets pa
        JOIN social_accounts sa ON sa.id = pa.social_account_id
        ORDER BY pa.health_status, pa.platform, pa.asset_name
      `;

  return NextResponse.json({ assets: rows });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { checkAllAssetHealth } = await import("@/lib/pipeline/asset-health");
  const summary = await checkAllAssetHealth();

  return NextResponse.json({ summary });
}
