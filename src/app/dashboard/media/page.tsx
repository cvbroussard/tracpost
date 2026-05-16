import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MediaGrid } from "@/components/media-grid";
import { MediaFilters } from "./media-filters";
import { UploadBar } from "@/components/upload-bar";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; source?: string; type?: string; scene?: string; sort?: string; project?: string; briefing?: string; archived?: string; projectName?: string }>;
}

export default async function MediaPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Source Library</h1>
        <p className="py-12 text-center text-sm text-muted">Add a business first to start uploading source assets.</p>
      </div>
    );
  }

  // Reviewer-mode swap: render a pre-captured screenshot of the full
  // content area (header + upload buttons + grid all baked into the
  // image). No live header above it — the screenshot IS the page.
  if (session.role === "reviewer") {
    return (
      <div className="p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/review-screenshots/source-library.png"
          alt="Source Library"
          className="w-full max-w-5xl rounded border border-border"
        />
      </div>
    );
  }

  const siteId = session.activeSiteId;
  const params = await searchParams;
  const search = (params.q || "").trim();
  const sourceFilter = params.source || "all";
  const mediaTypeFilter = params.type || "all";
  const sceneFilter = params.scene || "all";
  const sortOrder = params.sort || "newest";
  const projectFilter = params.project || "all";
  const briefingFilter = params.briefing || "all";
  // Per project_tracpost_deletion_policy.md: ?archived=true reveals archived
  // assets (operator + restore use case). Default hides them.
  const showArchived = params.archived === "true";

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
               ma.quality_score, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, ma.archived_at, ma.briefable_at, ma.scene_types,
               (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (CASE WHEN ${showArchived} THEN ma.archived_at IS NOT NULL ELSE ma.archived_at IS NULL END)
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
               ma.quality_score, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, ma.archived_at, ma.briefable_at, ma.scene_types,
               (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (CASE WHEN ${showArchived} THEN ma.archived_at IS NOT NULL ELSE ma.archived_at IS NULL END)
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
               ma.quality_score, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, ma.archived_at, ma.briefable_at, ma.scene_types,
               (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (CASE WHEN ${showArchived} THEN ma.archived_at IS NOT NULL ELSE ma.archived_at IS NULL END)
          AND (${projectId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM asset_projects ap
            WHERE ap.asset_id = ma.id AND ap.project_id = ${projectId}::uuid
          ))
        ORDER BY COALESCE((ma.metadata->>'used_count')::int, 0) ASC, ma.sort_order DESC
        LIMIT 500
      `
    : await sql`
        SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.triage_status,
               ma.quality_score, ma.content_tags,
               ma.source, ma.ai_analysis, ma.metadata, ma.date_taken, ma.sort_order,
               ma.platform_fit, ma.flag_reason, ma.shelve_reason, ma.created_at,
               ma.render_status, ma.archived_at, ma.briefable_at, ma.scene_types,
               (SELECT COUNT(*)::int FROM jsonb_object_keys(ma.variants)) AS variant_count
        FROM media_assets ma
        WHERE ma.site_id = ${siteId}
          AND (CASE WHEN ${showArchived} THEN ma.archived_at IS NOT NULL ELSE ma.archived_at IS NULL END)
          AND (${projectId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM asset_projects ap
            WHERE ap.asset_id = ma.id AND ap.project_id = ${projectId}::uuid
          ))
        ORDER BY ma.sort_order DESC NULLS LAST
        LIMIT 500
      `;

  // Hydrate latest recording transcript per asset — recordings.transcript
  // is the canonical asset narrative now (per
  // project_tracpost_recording_as_canonical.md). Falls back to the legacy
  // context_note display in the grid when no recording exists for an asset.
  const assetIdsForRecordings = (allAssets as Array<{ id: string }>).map(a => a.id);
  const latestTranscripts: Record<string, string> = {};
  if (assetIdsForRecordings.length > 0) {
    const recRows = await sql`
      SELECT DISTINCT ON (source_asset_id)
        source_asset_id, transcript
      FROM recordings
      WHERE source_asset_id = ANY(${assetIdsForRecordings}::uuid[])
        AND transcript IS NOT NULL
        AND transcript <> ''
        AND archived_at IS NULL
      ORDER BY source_asset_id, created_at DESC
    `;
    for (const r of recRows) {
      latestTranscripts[r.source_asset_id as string] = r.transcript as string;
    }
  }
  for (const a of allAssets as Array<Record<string, unknown>>) {
    a.latest_transcript = latestTranscripts[a.id as string] || null;
  }

  // Secondary filters applied in JS — cheaper than recomputing the
  // WHERE clause and keeps the SQL path static.
  let filtered = allAssets as Array<Record<string, unknown>>;

  if (search) {
    const needle = search.toLowerCase();
    filtered = filtered.filter(a => {
      // Search transcript first (canonical narrative), then context_note
      // (legacy fallback). Both are subscriber-meaningful text fields.
      const transcript = ((a.latest_transcript as string) || "").toLowerCase();
      const note = ((a.context_note as string) || "").toLowerCase();
      return transcript.includes(needle) || note.includes(needle);
    });
  }
  if (sourceFilter !== "all") {
    filtered = filtered.filter(a => (a.source || "upload") === sourceFilter);
  }
  if (mediaTypeFilter !== "all") {
    filtered = filtered.filter(a => a.media_type === mediaTypeFilter);
  }
  if (sceneFilter !== "all") {
    // Scene_types is the new array column (per migration #104). Match if
    // the requested scene type appears in the asset's array.
    filtered = filtered.filter(a => {
      const types = (a.scene_types || []) as string[];
      return types.includes(sceneFilter);
    });
  }
  if (briefingFilter === "pending") {
    filtered = filtered.filter(a => a.triage_status === "pending_briefing");
  }

  let filteredAssets = filtered.slice(0, 200);

  // Counts for filter badges. Quality buckets retired — operator-tier
  // signal, no subscriber affordance.
  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(source, 'upload') = 'upload')::int AS uploads,
      COUNT(*) FILTER (WHERE source = 'ai_generated')::int AS ai_generated,
      COUNT(*) FILTER (WHERE triage_status = 'pending_briefing' AND archived_at IS NULL)::int AS pending_briefing,
      COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived
    FROM media_assets WHERE site_id = ${siteId}
  `;

  const [siteData, allBrands, allProjects, allPersonas, allServices, allBranches, assetBrandRows, assetProjectRows, assetPersonaRows, assetServiceRows, assetBranchRows] = await Promise.all([
    sql`SELECT content_pillars, pillar_config, brand_label, project_label, persona_label, branch_label, service_label FROM sites WHERE id = ${siteId}`,
    sql`SELECT id, name, slug, url FROM brands WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM projects WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, type FROM personas WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM services WHERE site_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM branches WHERE site_id = ${siteId} ORDER BY name ASC`,
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
    sql`
      SELECT asv.asset_id, asv.service_id
      FROM asset_services asv
      JOIN media_assets ma ON ma.id = asv.asset_id
      WHERE ma.site_id = ${siteId}
    `,
    sql`
      SELECT ab.asset_id, ab.branch_id
      FROM asset_branches ab
      JOIN media_assets ma ON ma.id = ab.asset_id
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

  const assetServiceMap: Record<string, string[]> = {};
  for (const row of assetServiceRows) {
    const aid = row.asset_id as string;
    if (!assetServiceMap[aid]) assetServiceMap[aid] = [];
    assetServiceMap[aid].push(row.service_id as string);
  }

  const assetBranchMap: Record<string, string[]> = {};
  for (const row of assetBranchRows) {
    const aid = row.asset_id as string;
    if (!assetBranchMap[aid]) assetBranchMap[aid] = [];
    assetBranchMap[aid].push(row.branch_id as string);
  }

  const pillars = (siteData[0]?.content_pillars || []) as string[];
  const pillarConfig = (siteData[0]?.pillar_config || []) as Array<{
    id: string; label: string; description: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  const brandLabel = (siteData[0]?.brand_label as string) || null;
  const projectLabel = (siteData[0]?.project_label as string) || null;
  const personaLabel = (siteData[0]?.persona_label as string) || null;
  const serviceLabel = (siteData[0]?.service_label as string) || null;
  const branchLabel = (siteData[0]?.branch_label as string) || null;

  // Project filter is applied in SQL above (pre-LIMIT) so the slice
  // picks from project-matching rows, not from the library at large.

  return (
    <div className="p-4 space-y-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Source Library</h1>
          <p className="text-sm text-muted">
            {filteredAssets.length} of {counts[0]?.total || 0} source assets
          </p>
        </div>
        <UploadBar
          siteId={siteId}
          projectId={projectId}
          projectName={params.projectName || null}
        />
      </div>

      <MediaFilters
        search={search}
        sourceFilter={sourceFilter}
        mediaTypeFilter={mediaTypeFilter}
        sceneFilter={sceneFilter}
        sortOrder={sortOrder}
        projectFilter={projectFilter}
        briefingFilter={briefingFilter}
        showArchived={showArchived}
        counts={counts[0] as { total: number; uploads: number; ai_generated: number; pending_briefing: number }}
        projects={allProjects.map((p) => ({ id: p.id as string, name: p.name as string }))}
      />

      {showArchived && (
        <div className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Showing {(counts[0] as { archived: number }).archived} archived asset{(counts[0] as { archived: number }).archived === 1 ? "" : "s"} — click <span className="font-semibold">✓ Archived</span> in filters to return to your active library.
        </div>
      )}

      {filteredAssets.length > 0 ? (
        <MediaGrid
          initialAssets={filteredAssets as unknown as Parameters<typeof MediaGrid>[0]["initialAssets"]}
          availablePillars={pillars}
          pillarConfig={pillarConfig}
          siteId={siteId}
          brands={allBrands as Array<{ id: string; name: string; slug: string; url: string | null }>}
          projects={allProjects as Array<{ id: string; name: string; slug: string }>}
          services={allServices as Array<{ id: string; name: string; slug: string }>}
          branches={allBranches as Array<{ id: string; name: string; slug: string }>}
          brandLabel={brandLabel}
          projectLabel={projectLabel}
          serviceLabel={serviceLabel}
          branchLabel={branchLabel}
          assetBrandMap={assetBrandMap}
          assetProjectMap={assetProjectMap}
          assetPersonaMap={assetPersonaMap}
          assetServiceMap={assetServiceMap}
          assetBranchMap={assetBranchMap}
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
