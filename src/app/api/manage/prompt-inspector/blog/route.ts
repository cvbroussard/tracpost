import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  assembleBlogPrompt,
  buildBlockTraces,
  buildSkippedBlocks,
  assessReadiness,
} from "@/lib/v2-generator/blog";

/**
 * POST /api/manage/prompt-inspector/blog
 *
 * Runs the full blog-prompt assembly (assessment-equivalent + spec
 * resolution + asset enrichment + Wikipedia + vendor/project links +
 * prompt construction) but stops before the LLM call. Adds per-block
 * trace metadata so the inspector can show each block's origin.
 *
 * Body:
 *   {
 *     siteId: string,
 *     seedAssetId?: string,    // optional override; otherwise picks fresh hero
 *     contentTypeOverride?: "authority_overview" | "deep_dive" | "project_story" | "vendor_spotlight",
 *     intent?: string
 *   }
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { siteId, seedAssetId, contentTypeOverride, intent } = body || {};

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Pick a fresh hero if caller didn't pin one. Inspector doesn't persist
  // articles, so the "unused" filter never updates between clicks —
  // deterministic ORDER BY would return the same asset forever. Randomize
  // among the top 20 quality candidates so each Generate Prompt click
  // rotates while still preferring high-quality + video assets.
  let heroId: string | null = seedAssetId || null;
  if (!heroId) {
    const usedRows = await sql`
      SELECT DISTINCT id FROM (
        SELECT seed_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${siteId} AND seed_asset_id IS NOT NULL
        UNION
        SELECT hero_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${siteId}
      ) u
    `;
    const usedIds = usedRows.map((r) => r.id);
    const candidates = await sql`
      SELECT id FROM media_assets
      WHERE site_id = ${siteId}
        AND (media_type ILIKE 'image%' OR media_type = 'video')
        AND triage_status NOT IN ('quarantined','shelved')
        AND status NOT IN ('deleted','failed')
        AND context_note IS NOT NULL
        AND id <> ALL(${usedIds}::uuid[])
      ORDER BY
        CASE WHEN media_type = 'video' THEN 0 ELSE 1 END,
        quality_score DESC NULLS LAST,
        created_at DESC
      LIMIT 20
    `;
    const ids = candidates.map((r) => r.id as string);
    heroId = ids.length > 0 ? ids[Math.floor(Math.random() * ids.length)] : null;
  }

  if (!heroId) {
    return NextResponse.json(
      { error: "No eligible asset found for this site" },
      { status: 404 },
    );
  }

  // Body candidates — pillar-matched if hero has a pillar.
  const [hero] = await sql`SELECT content_pillar FROM media_assets WHERE id = ${heroId}`;
  const pillar = hero?.content_pillar as string | null;
  const bodyRows = pillar
    ? await sql`
        SELECT id FROM media_assets
        WHERE site_id = ${siteId}
          AND id <> ${heroId}
          AND triage_status NOT IN ('quarantined','shelved')
          AND status NOT IN ('deleted','failed')
          AND (media_type ILIKE 'image%' OR media_type = 'video')
          AND (content_pillar = ${pillar} OR ${pillar} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 8
      `
    : await sql`
        SELECT id FROM media_assets
        WHERE site_id = ${siteId}
          AND id <> ${heroId}
          AND triage_status NOT IN ('quarantined','shelved')
          AND status NOT IN ('deleted','failed')
          AND (media_type ILIKE 'image%' OR media_type = 'video')
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 8
      `;
  const bodyAssetIds = bodyRows.map((r) => r.id as string);

  try {
    const assembled = await assembleBlogPrompt({
      siteId,
      heroAssetId: heroId,
      bodyAssetIds,
      seedAssetId: heroId,
      intent: intent || undefined,
      contentTypeOverride: contentTypeOverride || undefined,
      status: "draft",
      // Inspector previews must not consume hooks; pullHook would
      // otherwise increment used_count for unpublished previews.
      dryRun: true,
    });

    const traces = buildBlockTraces(assembled);
    const skipped = buildSkippedBlocks(assembled);
    const readiness = assessReadiness(assembled);

    return NextResponse.json({
      assembled,
      traces,
      skipped,
      readiness,
      heroAssetId: heroId,
      pillar,
      bodyAssetCount: bodyAssetIds.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Assembly failed" },
      { status: 500 },
    );
  }
}
