import { isAdminRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/asset-analysis/[assetId]
 *
 * Aggregator for the manager-side Media Production › Analysis modal. One
 * round trip returns everything useAssetAnalysis + AnalyzeResultsPanel need
 * for a single asset: the per-site catalogs, pillar config + labels, the
 * asset's current tags, the latest transcript, and the owning subscription
 * id (the manage adapter appends it as ?subscription_id for the analysis
 * action routes).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;

  const [asset] = await sql`
    SELECT id, storage_url, media_type, business_id, content_tags, scene_types
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  const siteId = asset.business_id as string;

  const [site] = await sql`
    SELECT billing_account_id, pillar_config,
           brand_label, project_label, service_label, branch_label
    FROM businesses
    WHERE id = ${siteId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const [
    brands, projects, services, branches,
    brandRows, projectRows, serviceRows, branchRows,
    recRows,
  ] = await Promise.all([
    sql`SELECT id, name, slug, url FROM brands WHERE business_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM projects WHERE business_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM services WHERE business_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT id, name, slug FROM locations WHERE business_id = ${siteId} ORDER BY name ASC`,
    sql`SELECT brand_id FROM asset_brands WHERE asset_id = ${assetId}`,
    sql`SELECT project_id FROM asset_projects WHERE asset_id = ${assetId}`,
    sql`SELECT service_id FROM asset_services WHERE asset_id = ${assetId}`,
    sql`SELECT location_id FROM asset_locations WHERE asset_id = ${assetId}`,
    sql`
      SELECT id, transcript FROM recordings
      WHERE source_asset_id = ${assetId}
        AND transcript IS NOT NULL AND transcript <> ''
        AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
  ]);

  const latest = recRows[0];
  return NextResponse.json({
    subscriptionId: site.billing_account_id,
    siteId,
    pillarConfig: site.pillar_config || [],
    brandLabel: site.brand_label,
    projectLabel: site.project_label,
    serviceLabel: site.service_label,
    branchLabel: site.branch_label,
    brands,
    projects,
    services,
    branches,
    asset: {
      id: asset.id,
      storageUrl: asset.storage_url,
      mediaType: asset.media_type,
      tags: asset.content_tags || [],
      sceneTypes: asset.scene_types || [],
      brandIds: brandRows.map((r) => r.brand_id as string),
      projectIds: projectRows.map((r) => r.project_id as string),
      serviceIds: serviceRows.map((r) => r.service_id as string),
      branchIds: branchRows.map((r) => r.location_id as string),
    },
    transcript: latest?.transcript || "",
    latestRecordingId: latest?.id || null,
  });
}
