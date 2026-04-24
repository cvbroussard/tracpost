import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizePageConfig } from "@/lib/tenant-site/page-config";

/**
 * GET /api/manage/site?site_id=xxx&view=overview|publishing|visual|website
 * Returns scoped site data for the manage workspace.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id");
  const view = url.searchParams.get("view") || "overview";

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  if (view === "overview") {
    const [site] = await sql`
      SELECT s.id, s.name, s.url, s.business_type, s.location,
             s.autopilot_enabled, s.provisioning_status,
             u.name AS subscriber_name, sub.plan
      FROM sites s
      JOIN subscriptions sub ON sub.id = s.subscription_id
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      WHERE s.id = ${siteId}
    `;
    if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId}) AS total_assets,
        (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId} AND source = 'upload') AS uploads,
        (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId} AND source = 'ai_generated') AS ai_assets,
        (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId}) AS total_posts,
        (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'published') AS published_posts,
        (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'draft') AS draft_posts,
        (SELECT COUNT(*)::int FROM brands WHERE site_id = ${siteId}) AS vendors,
        (SELECT COUNT(*)::int FROM projects WHERE site_id = ${siteId}) AS projects,
        (SELECT COUNT(*)::int FROM personas WHERE site_id = ${siteId}) AS personas
    `;

    const platforms = await sql`
      SELECT sa.platform, sa.account_name, sa.status
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
      ORDER BY sa.platform
    `;

    return NextResponse.json({ site, counts, platforms });
  }

  if (view === "publishing") {
    const [site] = await sql`
      SELECT s.autopilot_enabled, s.cadence_config, s.video_ratio,
             s.blog_cadence, s.article_mix,
             bs.blog_enabled, bs.subdomain, bs.blog_title
      FROM sites s
      LEFT JOIN blog_settings bs ON bs.site_id = s.id
      WHERE s.id = ${siteId}
    `;

    const platforms = await sql`
      SELECT sa.platform, sa.account_name, sa.status
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
      ORDER BY sa.platform
    `;

    return NextResponse.json({ site, platforms });
  }

  if (view === "visual") {
    const [site] = await sql`
      SELECT s.image_style, s.image_variations, s.image_processing_mode,
             s.inline_upload_count, s.inline_ai_count, s.content_vibe,
             s.hero_asset_id, s.pillar_config, s.metadata
      FROM sites s
      WHERE s.id = ${siteId}
    `;

    const heroAssets = await sql`
      SELECT id, storage_url, context_note, quality_score
      FROM media_assets
      WHERE site_id = ${siteId}
        AND triage_status = 'triaged'
        AND media_type LIKE 'image%'
      ORDER BY quality_score DESC NULLS LAST
      LIMIT 12
    `;

    return NextResponse.json({ site, heroAssets });
  }

  if (view === "website") {
    const [site] = await sql`
      SELECT s.page_config, s.work_content, s.business_type,
             (s.website_copy IS NOT NULL) AS has_website_copy,
             bs.custom_domain
      FROM sites s
      LEFT JOIN blog_settings bs ON bs.site_id = s.id
      WHERE s.id = ${siteId}
    `;

    const pageConfig = normalizePageConfig(site?.page_config, (site?.business_type as string) || null);

    return NextResponse.json({
      site: {
        ...site,
        page_config: pageConfig,
      },
    });
  }

  if (view === "corrections") {
    const corrections = await sql`
      SELECT id, category, rule, scope, example_before, example_after,
             source_note, is_active, created_at
      FROM content_corrections
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
    `.catch(() => []);

    return NextResponse.json({ corrections });
  }

  return NextResponse.json({ error: "Unknown view" }, { status: 400 });
}
