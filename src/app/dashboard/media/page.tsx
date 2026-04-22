import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MediaGrid } from "@/components/media-grid";
import { MediaFilters } from "./media-filters";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ source?: string; type?: string; scene?: string; quality?: string; sort?: string; project?: string }>;
}

export default async function MediaPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
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
  const projectFilter = params.project || "all";

  // Sort must happen in SQL so that the LIMIT picks from the correct
  // end of the dataset. The project filter must ALSO happen in SQL,
  // before the LIMIT — otherwise a narrow project's photos can get
  // sliced out when they don't fall in the newest/oldest 500 of the
  // full library. Branching on fixed allow-lists keeps each query
  // static — no string interpolation into the SQL body.
  const projectId = projectFilter !== "all" ? projectFilter : null;

  const allAssets = sortOrder === "oldest"
    ? await sql`
        SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.triage_status,
               ma.quality_score, ma.content_pillar, ma.content_pillars, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (${projectId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM asset_projects ap
            WHERE ap.asset_id = ma.id AND ap.project_id = ${projectId}::uuid
          ))
        ORDER BY ma.sort_order ASC NULLS LAST
        LIMIT 500
      `
    : sortOrder === "quality"
    ? await sql`
        SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.triage_status,
               ma.quality_score, ma.content_pillar, ma.content_pillars, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (${projectId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM asset_projects ap
            WHERE ap.asset_id = ma.id AND ap.project_id = ${projectId}::uuid
          ))
        ORDER BY ma.quality_score DESC NULLS LAST
        LIMIT 500
      `
    : sortOrder === "least_used"
    ? await sql`
        SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.triage_status,
               ma.quality_score, ma.content_pillar, ma.content_pillars, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (${projectId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM asset_projects ap
            WHERE ap.asset_id = ma.id AND ap.project_id = ${projectId}::uuid
          ))
        ORDER BY COALESCE((ma.metadata->>'used_count')::int, 0) ASC, ma.sort_order DESC
        LIMIT 500
      `
    : await sql`
        SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.triage_status,
               ma.quality_score, ma.content_pillar, ma.content_pillars, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (${projectId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM asset_projects ap
            WHERE ap.asset_id = ma.id AND ap.project_id = ${projectId}::uuid
          ))
        ORDER BY ma.sort_order DESC NULLS LAST
        LIMIT 500
      `;

  // Secondary filters applied in JS — cheaper than recomputing the
  // WHERE clause and keeps the SQL path static.
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

  let filteredAssets = filtered.slice(0, 200);

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

  const [siteData, allBrands, allProjects, allPersonas, assetBrandRows, assetProjectRows, assetPersonaRows] = await Promise.all([
    sql`SELECT content_pillars, pillar_config, brand_label, project_label, persona_label, location_label FROM sites WHERE id = ${siteId}`,
    sql`SELECT id, name, slug, url FROM brands WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM projects WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, type FROM personas WHERE site_id = ${siteId} ORDER BY name ASC`,
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
    sql`
      SELECT ap.asset_id, ap.persona_id
      FROM asset_personas ap
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

  const assetPersonaMap: Record<string, string[]> = {};
  for (const row of assetPersonaRows) {
    const aid = row.asset_id as string;
    if (!assetPersonaMap[aid]) assetPersonaMap[aid] = [];
    assetPersonaMap[aid].push(row.persona_id as string);
  }

  const pillars = (siteData[0]?.content_pillars || []) as string[];
  const pillarConfig = (siteData[0]?.pillar_config || []) as Array<{
    id: string; label: string; description: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  const brandLabel = (siteData[0]?.brand_label as string) || null;
  const projectLabel = (siteData[0]?.project_label as string) || null;
  const personaLabel = (siteData[0]?.persona_label as string) || null;

  // Project filter is applied in SQL above (pre-LIMIT) so the slice
  // picks from project-matching rows, not from the library at large.

  return (
    <div className="p-4 space-y-6">
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
        projectFilter={projectFilter}
        counts={counts[0] as { total: number; uploads: number; ai_generated: number; high_quality: number; medium_quality: number; low_quality: number }}
        projects={allProjects.map((p) => ({ id: p.id as string, name: p.name as string }))}
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
          assetPersonaMap={assetPersonaMap}
          personaLabel={personaLabel}
          personaList={allPersonas.map((p) => ({ id: p.id as string, name: p.name as string, type: (p.type as string) || "person" }))}
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
