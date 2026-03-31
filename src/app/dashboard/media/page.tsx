import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MediaGrid } from "@/components/media-grid";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
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

  const [assets, siteData, vendors, assetVendorRows] = await Promise.all([
    sql`
      SELECT id, storage_url, media_type, context_note, triage_status,
             quality_score, content_pillar, content_pillars, content_tags, platform_fit, flag_reason,
             shelve_reason, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT 200
    `,
    sql`SELECT content_pillars, pillar_config FROM sites WHERE id = ${siteId}`,
    sql`SELECT id, name, slug, url FROM vendors WHERE subscriber_id = ${session.subscriberId} ORDER BY name ASC`,
    sql`
      SELECT av.asset_id, av.vendor_id
      FROM asset_vendors av
      JOIN media_assets ma ON ma.id = av.asset_id
      WHERE ma.site_id = ${siteId}
    `,
  ]);

  // Build asset→vendor_ids map
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
            {assets.length} asset{assets.length !== 1 ? "s" : ""} &middot; Click to edit
          </p>
        </div>
      </div>

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
          <h3 className="mb-1 text-sm font-medium">No media uploaded</h3>
          <p className="max-w-xs text-xs text-muted">
            Upload photos and videos from the Capture page to start building your content library.
          </p>
        </div>
      )}
    </div>
  );
}
