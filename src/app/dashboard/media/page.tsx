import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MediaGrid } from "@/components/media-grid";
import { MediaFilters } from "./media-filters";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ source?: string; scene?: string; quality?: string; sort?: string }>;
}

export default async function MediaPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first to start uploading media.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;
  const params = await searchParams;
  const sourceFilter = params.source || "all";
  const sceneFilter = params.scene || "all";
  const qualityFilter = params.quality || "all";
  const sortOrder = params.sort || "newest";

  // Build filtered query
  let assets;
  if (sortOrder === "quality") {
    assets = await sql`
      SELECT id, storage_url, media_type, context_note, triage_status,
             quality_score, content_pillar, content_pillars, content_tags,
             source, ai_analysis, metadata,
             platform_fit, flag_reason, shelve_reason, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
        AND (${sourceFilter} = 'all' OR source = ${sourceFilter})
        AND (${sceneFilter} = 'all' OR ai_analysis->>'scene_type' = ${sceneFilter})
        AND (
          ${qualityFilter} = 'all'
          OR (${qualityFilter} = 'high' AND quality_score >= 0.8)
          OR (${qualityFilter} = 'medium' AND quality_score >= 0.5 AND quality_score < 0.8)
          OR (${qualityFilter} = 'low' AND quality_score < 0.5)
        )
      ORDER BY quality_score DESC
      LIMIT 200
    `;
  } else if (sortOrder === "least_used") {
    assets = await sql`
      SELECT id, storage_url, media_type, context_note, triage_status,
             quality_score, content_pillar, content_pillars, content_tags,
             source, ai_analysis, metadata,
             platform_fit, flag_reason, shelve_reason, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
        AND (${sourceFilter} = 'all' OR source = ${sourceFilter})
        AND (${sceneFilter} = 'all' OR ai_analysis->>'scene_type' = ${sceneFilter})
        AND (
          ${qualityFilter} = 'all'
          OR (${qualityFilter} = 'high' AND quality_score >= 0.8)
          OR (${qualityFilter} = 'medium' AND quality_score >= 0.5 AND quality_score < 0.8)
          OR (${qualityFilter} = 'low' AND quality_score < 0.5)
        )
      ORDER BY COALESCE((metadata->>'used_count')::int, 0) ASC, created_at DESC
      LIMIT 200
    `;
  } else {
    assets = await sql`
      SELECT id, storage_url, media_type, context_note, triage_status,
             quality_score, content_pillar, content_pillars, content_tags,
             source, ai_analysis, metadata,
             platform_fit, flag_reason, shelve_reason, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
        AND (${sourceFilter} = 'all' OR source = ${sourceFilter})
        AND (${sceneFilter} = 'all' OR ai_analysis->>'scene_type' = ${sceneFilter})
        AND (
          ${qualityFilter} = 'all'
          OR (${qualityFilter} = 'high' AND quality_score >= 0.8)
          OR (${qualityFilter} = 'medium' AND quality_score >= 0.5 AND quality_score < 0.8)
          OR (${qualityFilter} = 'low' AND quality_score < 0.5)
        )
      ORDER BY created_at DESC
      LIMIT 200
    `;
  }

  // Counts for filter badges
  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE source = 'upload')::int AS uploads,
      COUNT(*) FILTER (WHERE source = 'ai_generated')::int AS ai_generated,
      COUNT(*) FILTER (WHERE quality_score >= 0.8)::int AS high_quality,
      COUNT(*) FILTER (WHERE quality_score >= 0.5 AND quality_score < 0.8)::int AS medium_quality,
      COUNT(*) FILTER (WHERE quality_score < 0.5)::int AS low_quality
    FROM media_assets WHERE site_id = ${siteId}
  `;

  const [siteData, vendors, assetVendorRows] = await Promise.all([
    sql`SELECT content_pillars, pillar_config FROM sites WHERE id = ${siteId}`,
    sql`SELECT id, name, slug, url FROM vendors WHERE subscriber_id = ${session.subscriberId} ORDER BY name ASC`,
    sql`
      SELECT av.asset_id, av.vendor_id
      FROM asset_vendors av
      JOIN media_assets ma ON ma.id = av.asset_id
      WHERE ma.site_id = ${siteId}
    `,
  ]);

  const assetVendorMap: Record<string, string[]> = {};
  for (const row of assetVendorRows) {
    const aid = row.asset_id as string;
    if (!assetVendorMap[aid]) assetVendorMap[aid] = [];
    assetVendorMap[aid].push(row.vendor_id as string);
  }

  const pillars = (siteData[0]?.content_pillars || []) as string[];
  const pillarConfig = (siteData[0]?.pillar_config || []) as Array<{
    id: string; label: string; description: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
          <p className="text-sm text-muted">
            {assets.length} of {counts[0]?.total || 0} assets
          </p>
        </div>
      </div>

      <MediaFilters
        sourceFilter={sourceFilter}
        sceneFilter={sceneFilter}
        qualityFilter={qualityFilter}
        sortOrder={sortOrder}
        counts={counts[0] as { total: number; uploads: number; ai_generated: number; high_quality: number; medium_quality: number; low_quality: number }}
      />

      {assets.length > 0 ? (
        <MediaGrid
          initialAssets={assets as Parameters<typeof MediaGrid>[0]["initialAssets"]}
          availablePillars={pillars}
          pillarConfig={pillarConfig}
          siteId={siteId}
          vendors={vendors as Array<{ id: string; name: string; slug: string; url: string | null }>}
          assetVendorMap={assetVendorMap}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <span className="mb-3 text-3xl">▣</span>
          <h3 className="mb-1 text-sm font-medium">No matching assets</h3>
          <p className="max-w-xs text-xs text-muted">
            Try adjusting your filters or upload new content.
          </p>
        </div>
      )}
    </div>
  );
}
