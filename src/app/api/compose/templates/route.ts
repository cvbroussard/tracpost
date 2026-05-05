import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/compose/templates
 *
 * Returns the post_templates available to the active site, filtered by
 * the platforms the subscriber has connected for this site. Blog is
 * always included (TracPost-owned property — no external connection
 * required).
 *
 * The Compose page's template picker dropdown consumes this list.
 *
 * Response shape:
 *   { templates: [{ id, platform, format, name, description,
 *                   asset_slots, metadata_requirements, sort_order }] }
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = session.activeSiteId;
  if (!siteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  // Determine which external platforms are connected (have a primary
  // platform_asset assigned to this site). Blog is always available.
  const connectedRows = await sql`
    SELECT DISTINCT pa.platform
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${siteId}
      AND spa.is_primary = true
      AND sa.subscription_id = ${session.subscriptionId}
  `;
  const connectedPlatforms = connectedRows.map((r) => r.platform as string);
  // Blog is always available (TracPost-owned, no external OAuth required).
  if (!connectedPlatforms.includes("blog")) connectedPlatforms.push("blog");

  if (connectedPlatforms.length === 0) {
    return NextResponse.json({ templates: [], connectedPlatforms: [] });
  }

  const templates = await sql`
    SELECT id, platform, format, name, description,
           asset_slots, metadata_requirements, sort_order
    FROM post_templates
    WHERE enabled = true
      AND platform = ANY(${connectedPlatforms}::text[])
    ORDER BY sort_order, name
  `;

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      platform: t.platform,
      format: t.format,
      name: t.name,
      description: t.description,
      assetSlots: t.asset_slots,
      metadataRequirements: t.metadata_requirements,
      sortOrder: t.sort_order,
    })),
    connectedPlatforms,
  });
}
