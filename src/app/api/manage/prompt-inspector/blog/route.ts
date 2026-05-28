import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { primaryPillarFromTags, type PillarConfig } from "@/lib/pillars";
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
        SELECT seed_asset_id AS id FROM blog_posts_v2 WHERE business_id = ${siteId} AND seed_asset_id IS NOT NULL
        UNION
        SELECT hero_asset_id AS id FROM blog_posts_v2 WHERE business_id = ${siteId}
      ) u
    `;
    const usedIds = usedRows.map((r) => r.id);
    const candidates = await sql`
      SELECT id FROM media_assets
      WHERE business_id = ${siteId}
        AND (media_type ILIKE 'image%' OR media_type = 'video')
        AND processing_stage IN ('briefed','analyzed')
        AND archived_at IS NULL
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

  // Body candidates — pillar-matched if hero has tags whose parent pillar
  // resolves. Pillar derived from tags via site pillar_config (LOCKED 2026-05-09).
  const [hero] = await sql`SELECT content_tags FROM media_assets WHERE id = ${heroId}`;
  const [pcRow] = await sql`SELECT pillar_config FROM businesses WHERE id = ${siteId}`;
  const pc = (pcRow?.pillar_config || []) as PillarConfig;
  const pillar = primaryPillarFromTags(
    (hero?.content_tags as string[] | null) || null,
    pc,
  );
  const pillarTagIds = pillar
    ? (pc.find((p) => p.id === pillar)?.tags.map((t) => t.id) || [])
    : [];

  const bodyRows = pillarTagIds.length > 0
    ? await sql`
        SELECT id FROM media_assets
        WHERE business_id = ${siteId}
          AND id <> ${heroId}
          AND processing_stage IN ('briefed','analyzed')
          AND archived_at IS NULL
          AND (media_type ILIKE 'image%' OR media_type = 'video')
          AND content_tags && ${pillarTagIds}::text[]
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT 8
      `
    : await sql`
        SELECT id FROM media_assets
        WHERE business_id = ${siteId}
          AND id <> ${heroId}
          AND processing_stage IN ('briefed','analyzed')
          AND archived_at IS NULL
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
