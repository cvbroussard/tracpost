import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/accounts/all-status?site_id=xxx
 *
 * Returns per-platform status for the Connections hub.
 *   - status: "connected" | "pending_assignment" | "not_connected"
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = new URL(req.url).searchParams.get("site_id") || session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  // 1. Assigned platform_assets for this site (new model)
  const assigned = await sql`
    SELECT pa.platform, pa.asset_name, sa.token_expires_at
    FROM business_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.business_id = ${siteId}
      AND spa.is_primary = true
      AND sa.billing_account_id = ${session.subscriptionId}
  `;

  // 2. Legacy site_social_links rows
  const legacy = await sql`
    SELECT sa.platform, sa.account_name, sa.status, sa.token_expires_at
    FROM social_accounts sa
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId}
      AND sa.billing_account_id = ${session.subscriptionId}
    ORDER BY sa.created_at DESC
  `;

  // 3. All platform_assets for this subscriber (to detect pending_assignment)
  const available = await sql`
    SELECT pa.platform, COUNT(*)::int AS count
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE sa.billing_account_id = ${session.subscriptionId}
    GROUP BY pa.platform
  `;

  const byPlatform: Record<string, {
    status: "connected" | "pending_assignment" | "not_connected";
    accountName: string | null;
    tokenExpiresAt: string | null;
    availableAssets?: number;
  }> = {};

  // First pass: assigned (new model)
  for (const row of assigned) {
    const key = row.platform as string;
    byPlatform[key] = {
      status: "connected",
      accountName: row.asset_name as string,
      tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null,
    };
  }

  // Second pass: legacy rows (only if not already set)
  for (const row of legacy) {
    const key = row.platform as string;
    if (!byPlatform[key]) {
      byPlatform[key] = {
        status: "connected",
        accountName: row.account_name as string,
        tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null,
      };
    }
  }

  // Third pass: pending_assignment
  for (const row of available) {
    const key = row.platform as string;
    if (!byPlatform[key]) {
      byPlatform[key] = {
        status: "pending_assignment",
        accountName: null,
        tokenExpiresAt: null,
        availableAssets: row.count as number,
      };
    }
  }

  return NextResponse.json(byPlatform);
}
