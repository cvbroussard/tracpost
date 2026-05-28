import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { slice, findFormatKey, type ContentKit } from "@/lib/v2-generator";
import { type PillarConfig } from "@/lib/pillars";

/**
 * GET /api/compose/recommend?template_id=...&anchor_id=...&anchor_type=...
 *
 * v2 path: reads the chosen anchor (blog_post / project / service) from
 * the v2 tables, returns its asset manifest as the recommended package,
 * and slices the anchor's content_kit for the template's platform format
 * to produce the caption + hashtags.
 *
 * No LLM call at this step — slicing is deterministic and runs in
 * microseconds. The article-creation pipeline already paid the LLM cost
 * once when it generated the kit; every Compose render is now free.
 *
 * No fallback to legacy. If anchor isn't in v2, the picker shouldn't have
 * surfaced it. If the manifest is short for the template's slot count,
 * pad with topic-pillar-matched media_assets from the site library.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "No active site" }, { status: 400 });

  const params = new URL(req.url).searchParams;
  const templateId = params.get("template_id");
  const anchorId = params.get("anchor_id");
  const anchorType = params.get("anchor_type") as "blog_post" | "project" | "service" | null;
  if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 });
  if (!anchorId || !anchorType) {
    return NextResponse.json({ error: "anchor_id and anchor_type required" }, { status: 400 });
  }

  // Template
  const [template] = await sql`
    SELECT id, platform, format, name, asset_slots
    FROM post_templates
    WHERE id = ${templateId} AND enabled = true
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Verify the platform is connected (mirrors legacy check; blog skips)
  if (template.platform !== "blog") {
    const [bound] = await sql`
      SELECT pa.id
      FROM business_platform_assets spa
      JOIN platform_assets pa ON pa.id = spa.platform_asset_id
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE spa.business_id = ${siteId}
        AND pa.platform = ${template.platform}
        AND spa.is_primary = true
        AND sa.billing_account_id = ${session.subscriptionId}
      LIMIT 1
    `;
    if (!bound) {
      return NextResponse.json({
        error: `${template.platform} not connected to this site`,
      }, { status: 400 });
    }
  }

  // Slot count + allowed types from template
  const slots = (template.asset_slots as Record<string, unknown>) || {};
  const slotCount =
    typeof slots.count === "number" ? slots.count :
    typeof slots.count_min === "number" ? slots.count_min :
    1;
  const allowedTypes = Array.isArray(slots.allowed_types)
    ? (slots.allowed_types as string[])
    : ["image"];
  const typePatterns = allowedTypes.map((t) => `${t}%`);

  // Site URL — anchor URL prefix
  const [siteRow] = await sql`SELECT url FROM businesses WHERE id = ${siteId}`;
  const siteUrl = (siteRow?.url as string | null)?.replace(/\/+$/, "") || "";

  // Anchor lookup from v2 — pool-specific table
  const anchor = await loadAnchor(anchorId, anchorType, siteId);
  if (!anchor) {
    return NextResponse.json({
      error: `Anchor ${anchorType}:${anchorId} not found in v2 pool`,
    }, { status: 404 });
  }

  const anchorUrl = anchor.slug
    ? buildAnchorUrl(siteUrl, anchorType, anchor.slug)
    : siteUrl;

  // Asset assembly:
  //   1. Pull the manifest (anchor's curated assets, ordered by slot)
  //   2. Filter by template's allowed types
  //   3. If short for slotCount, pad with topic-pillar-matched media_assets
  //   4. Hero is always the manifest's role='hero' row (slot 0)
  const manifestRows = await loadManifest(anchorType, anchorId);
  const manifestAssets = await sql`
    SELECT id, storage_url, media_type, context_note, content_pillar,
           content_tags, ai_analysis, quality_score, created_at
    FROM media_assets
    WHERE id = ANY(${manifestRows.map((r) => r.media_asset_id)}::uuid[])
  `;
  const assetById = new Map(manifestAssets.map((a) => [a.id as string, a]));

  // Order by manifest slot_index
  const ordered = manifestRows
    .map((r) => assetById.get(r.media_asset_id as string))
    .filter((a): a is (typeof manifestAssets)[number] => Boolean(a));

  // Hero = role='hero' from manifest (always slot 0 by convention)
  const heroRow = manifestRows.find((r) => r.role === "hero");
  const heroAsset = heroRow ? assetById.get(heroRow.media_asset_id as string) : ordered[0];
  const heroTypeMismatch = heroAsset
    ? !allowedTypes.some((t) => String(heroAsset.media_type || "").startsWith(t))
    : false;

  // Filter ordered assets by template's allowed types for the picker
  const ANCHOR_PICKER_LIMIT = 20;
  const compatibleManifest = ordered.filter((a) =>
    typePatterns.some((p) => String(a.media_type || "").toLowerCase().startsWith(p.replace("%", "").toLowerCase())),
  );

  // Pad with topic-pillar matches from the wider library if needed
  const usedIds = new Set(compatibleManifest.map((a) => a.id as string));
  const pillar = (anchor.content_pillars[0] as string | null) || null;
  let assets = compatibleManifest;
  if (assets.length < ANCHOR_PICKER_LIMIT) {
    const padNeeded = ANCHOR_PICKER_LIMIT - assets.length;
    // Pillar filter migrated from ma.content_pillar lookup to tag-overlap
    // (LOCKED 2026-05-09 — pillars not stored on assets). Resolve target
    // pillar to its tag IDs via site pillar_config.
    let pillarTagIds: string[] = [];
    if (pillar) {
      const [pcRow] = await sql`SELECT pillar_config FROM businesses WHERE id = ${siteId}`;
      const pc = (pcRow?.pillar_config || []) as PillarConfig;
      pillarTagIds = pc.find((p) => p.id === pillar)?.tags.map((t) => t.id) || [];
    }
    const padded = pillarTagIds.length > 0
      ? await sql`
          SELECT id, storage_url, media_type, context_note,
                 content_tags, ai_analysis, quality_score, created_at
          FROM media_assets
          WHERE business_id = ${siteId}
            AND media_type ILIKE ANY(${typePatterns}::text[])
            AND processing_stage IN ('briefed', 'analyzed')
            AND archived_at IS NULL
            AND id <> ALL(${Array.from(usedIds)}::uuid[])
            AND content_tags && ${pillarTagIds}::text[]
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT ${padNeeded}
        `
      : await sql`
          SELECT id, storage_url, media_type, context_note,
                 content_tags, ai_analysis, quality_score, created_at
          FROM media_assets
          WHERE business_id = ${siteId}
            AND media_type ILIKE ANY(${typePatterns}::text[])
            AND processing_stage IN ('briefed', 'analyzed')
            AND archived_at IS NULL
            AND id <> ALL(${Array.from(usedIds)}::uuid[])
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT ${padNeeded}
        `;
    assets = [...assets, ...padded];
  }

  // Build recommended (first slotCount) and alternatives lists
  const recommended = assets.slice(0, slotCount).map((a) => ({
    id: a.id,
    url: a.storage_url,
    type: a.media_type,
    contextNote: a.context_note,
    qualityScore: a.quality_score,
  }));
  const alternatives = assets.slice(slotCount).map((a) => ({
    id: a.id,
    url: a.storage_url,
    type: a.media_type,
    contextNote: a.context_note,
    qualityScore: a.quality_score,
  }));

  // Caption + hashtags via deterministic slicing — no LLM call.
  const formatKey = findFormatKey(template.platform as string, template.format as string);
  let captionStub = anchor.title || "";
  let hashtags: string[] = [];
  if (formatKey && anchor.content_kit) {
    const sliced = slice(formatKey, anchor.content_kit, {
      anchorUrl,
      title: anchor.title,
    });
    captionStub = sliced.caption;
    hashtags = sliced.hashtags;
  }

  return NextResponse.json({
    template: {
      id: template.id,
      platform: template.platform,
      format: template.format,
      name: template.name,
    },
    slotCount,
    recommended,
    alternatives,
    captionStub,
    link: anchorUrl,
    cta: { type: "LEARN_MORE", label: "Learn More", url: anchorUrl },
    hashtags,
    heroTypeMismatch: heroTypeMismatch && heroAsset
      ? { heroType: heroAsset.media_type as string, allowedTypes }
      : null,
  });
}

// ─── helpers ────────────────────────────────────────────────────────

interface AnchorLookup {
  title: string;
  slug: string | null;
  excerpt: string | null;
  content_pillars: string[];
  content_kit: ContentKit | null;
}

async function loadAnchor(
  id: string,
  type: "blog_post" | "project" | "service",
  siteId: string,
): Promise<AnchorLookup | null> {
  if (type === "blog_post") {
    const [r] = await sql`
      SELECT title, slug, excerpt, content_pillars, content_kit
      FROM blog_posts_v2
      WHERE id = ${id} AND business_id = ${siteId}
    `;
    if (!r) return null;
    return {
      title: r.title as string,
      slug: r.slug as string,
      excerpt: r.excerpt as string | null,
      content_pillars: Array.isArray(r.content_pillars) ? (r.content_pillars as string[]) : [],
      content_kit: (r.content_kit as ContentKit | null) || null,
    };
  }
  if (type === "project") {
    const [r] = await sql`
      SELECT name AS title, slug, description AS excerpt, content_pillars, content_kit
      FROM projects_v2
      WHERE id = ${id} AND business_id = ${siteId}
    `;
    if (!r) return null;
    return {
      title: r.title as string,
      slug: r.slug as string,
      excerpt: r.excerpt as string | null,
      content_pillars: Array.isArray(r.content_pillars) ? (r.content_pillars as string[]) : [],
      content_kit: (r.content_kit as ContentKit | null) || null,
    };
  }
  if (type === "service") {
    const [r] = await sql`
      SELECT name AS title, slug, excerpt, content_pillars, content_kit
      FROM services_v2
      WHERE id = ${id} AND business_id = ${siteId}
    `;
    if (!r) return null;
    return {
      title: r.title as string,
      slug: r.slug as string,
      excerpt: r.excerpt as string | null,
      content_pillars: Array.isArray(r.content_pillars) ? (r.content_pillars as string[]) : [],
      content_kit: (r.content_kit as ContentKit | null) || null,
    };
  }
  return null;
}

async function loadManifest(
  type: "blog_post" | "project" | "service",
  anchorId: string,
): Promise<Array<{ media_asset_id: string; slot_index: number; role: string }>> {
  if (type === "blog_post") {
    const rows = await sql`
      SELECT media_asset_id, slot_index, role
      FROM blog_post_assets
      WHERE blog_post_id = ${anchorId}
      ORDER BY slot_index
    `;
    return rows as { media_asset_id: string; slot_index: number; role: string }[];
  }
  if (type === "project") {
    const rows = await sql`
      SELECT media_asset_id, slot_index, role
      FROM project_assets
      WHERE project_id = ${anchorId}
      ORDER BY slot_index
    `;
    return rows as { media_asset_id: string; slot_index: number; role: string }[];
  }
  if (type === "service") {
    const rows = await sql`
      SELECT media_asset_id, slot_index, role
      FROM service_assets
      WHERE service_id = ${anchorId}
      ORDER BY slot_index
    `;
    return rows as { media_asset_id: string; slot_index: number; role: string }[];
  }
  return [];
}

function buildAnchorUrl(siteUrl: string, type: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  if (type === "blog_post") return `${base}/blog/${slug}`;
  if (type === "project") return `${base}/projects/${slug}`;
  if (type === "service") return `${base}/services/${slug}`;
  return base;
}
