import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MediaGrid } from "@/components/media-grid";
import { MediaFilters } from "./media-filters";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ source?: string; type?: string; scene?: string; quality?: string; sort?: string }>;
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
  const mediaTypeFilter = params.type || "all";
  const sceneFilter = params.scene || "all";
  const qualityFilter = params.quality || "all";
  const sortOrder = params.sort || "newest";

  // Build WHERE conditions
  const conditions: string[] = [`site_id = '${siteId}'`];

  if (sourceFilter !== "all") {
    conditions.push(`COALESCE(source, 'upload') = '${sourceFilter}'`);
  }
  if (sceneFilter !== "all") {
    conditions.push(`ai_analysis->>'scene_type' = '${sceneFilter}'`);
  }
  if (qualityFilter === "high") {
    conditions.push("quality_score >= 0.8");
  } else if (qualityFilter === "medium") {
    conditions.push("quality_score >= 0.5 AND quality_score < 0.8");
  } else if (qualityFilter === "low") {
    conditions.push("quality_score < 0.5");
  }

  // Use parameterized queries per sort to avoid SQL injection
  // while still supporting dynamic WHERE
  // Fetch all assets for the site, apply server-side sort
  const orderClause = sortOrder === "quality" ? "quality_score DESC"
    : sortOrder === "least_used" ? "COALESCE((metadata->>'used_count')::int, 0) ASC, created_at DESC"
    : sortOrder === "oldest" ? "COALESCE(date_taken, created_at) ASC"
    : "COALESCE(date_taken, created_at) DESC";

  // Single query — filter in JS for reliability with Neon tagged templates
  // Note: SQL ORDER BY is always DESC here; JS re-sorts per orderClause
  const allAssets = await sql`
    SELECT id, storage_url, media_type, context_note, triage_status,
           quality_score, content_pillar, content_pillars, content_tags,
           source, ai_analysis, metadata, date_taken,
           platform_fit, flag_reason, shelve_reason, created_at
    FROM media_assets WHERE site_id = ${siteId}
    ORDER BY COALESCE(date_taken, created_at) DESC
    LIMIT 500
  `;

  // Apply filters in JS
  let filtered = allAssets as Array<Record<string, unknown>>;

  if (sourceFilter !== "all") {
    filtered = filtered.filter(a => (a.source || "upload") === sourceFilter);
  }
  if (mediaTypeFilter !== "all") {
    filtered = filtered.filter(a => a.media_type === mediaTypeFilter);
  }
  if (sceneFilter !== "all") {
    filtered = filtered.filter(a => {
      const analysis = (a.ai_analysis || {}) as Record<string, unknown>;
      return analysis.scene_type === sceneFilter;
    });
  }
  if (qualityFilter === "high") {
    filtered = filtered.filter(a => (a.quality_score as number) >= 0.8);
  } else if (qualityFilter === "medium") {
    filtered = filtered.filter(a => {
      const q = a.quality_score as number;
      return q >= 0.5 && q < 0.8;
    });
  } else if (qualityFilter === "low") {
    filtered = filtered.filter(a => (a.quality_score as number) < 0.5);
  }

  // Apply sort
  if (sortOrder === "oldest") {
    filtered.sort((a, b) => {
      const aDate = (a.date_taken || a.created_at) as string;
      const bDate = (b.date_taken || b.created_at) as string;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });
  } else if (sortOrder === "quality") {
    filtered.sort((a, b) => ((b.quality_score as number) || 0) - ((a.quality_score as number) || 0));
  } else if (sortOrder === "least_used") {
    filtered.sort((a, b) => {
      const aCount = ((a.metadata as Record<string, unknown>)?.used_count as number) || 0;
      const bCount = ((b.metadata as Record<string, unknown>)?.used_count as number) || 0;
      return aCount - bCount;
    });
  }

  const filteredAssets = filtered.slice(0, 200);

  // Counts for filter badges
  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(source, 'upload') = 'upload')::int AS uploads,
      COUNT(*) FILTER (WHERE source = 'ai_generated')::int AS ai_generated,
      COUNT(*) FILTER (WHERE quality_score >= 0.8)::int AS high_quality,
      COUNT(*) FILTER (WHERE quality_score >= 0.5 AND quality_score < 0.8)::int AS medium_quality,
      COUNT(*) FILTER (WHERE quality_score < 0.5)::int AS low_quality
    FROM media_assets WHERE site_id = ${siteId}
  `;

  const [siteData, allBrands, allProjects, assetBrandRows, assetProjectRows] = await Promise.all([
    sql`SELECT content_pillars, pillar_config, brand_label, project_label, client_label, location_label FROM sites WHERE id = ${siteId}`,
    sql`SELECT id, name, slug, url FROM brands WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM projects WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`
      SELECT ab.asset_id, ab.brand_id
      FROM asset_brands ab
      JOIN media_assets ma ON ma.id = ab.asset_id
      WHERE ma.site_id = ${siteId}
    `,
    sql`
      SELECT ap.asset_id, ap.project_id
      FROM asset_projects ap
      JOIN media_assets ma ON ma.id = ap.asset_id
      WHERE ma.site_id = ${siteId}
    `,
  ]);

  const assetBrandMap: Record<string, string[]> = {};
  for (const row of assetBrandRows) {
    const aid = row.asset_id as string;
    if (!assetBrandMap[aid]) assetBrandMap[aid] = [];
    assetBrandMap[aid].push(row.brand_id as string);
  }

  const assetProjectMap: Record<string, string[]> = {};
  for (const row of assetProjectRows) {
    const aid = row.asset_id as string;
    if (!assetProjectMap[aid]) assetProjectMap[aid] = [];
    assetProjectMap[aid].push(row.project_id as string);
  }

  const pillars = (siteData[0]?.content_pillars || []) as string[];
  const pillarConfig = (siteData[0]?.pillar_config || []) as Array<{
    id: string; label: string; description: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  const brandLabel = (siteData[0]?.brand_label as string) || null;
  const projectLabel = (siteData[0]?.project_label as string) || null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
          <p className="text-sm text-muted">
            {filteredAssets.length} of {counts[0]?.total || 0} assets
          </p>
        </div>
      </div>

      <MediaFilters
        sourceFilter={sourceFilter}
        mediaTypeFilter={mediaTypeFilter}
        sceneFilter={sceneFilter}
        qualityFilter={qualityFilter}
        sortOrder={sortOrder}
        counts={counts[0] as { total: number; uploads: number; ai_generated: number; high_quality: number; medium_quality: number; low_quality: number }}
      />

      {filteredAssets.length > 0 ? (
        <MediaGrid
          initialAssets={filteredAssets as unknown as Parameters<typeof MediaGrid>[0]["initialAssets"]}
          availablePillars={pillars}
          pillarConfig={pillarConfig}
          siteId={siteId}
          brands={allBrands as Array<{ id: string; name: string; slug: string; url: string | null }>}
          projects={allProjects as Array<{ id: string; name: string; slug: string }>}
          brandLabel={brandLabel}
          projectLabel={projectLabel}
          assetBrandMap={assetBrandMap}
          assetProjectMap={assetProjectMap}
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
