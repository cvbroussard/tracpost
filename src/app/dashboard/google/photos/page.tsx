import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PhotosClient } from "./photos-client";

export const dynamic = "force-dynamic";

export default async function GooglePhotosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  // All image assets with sync status
  const allPhotos = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.content_pillar,
           ma.ai_analysis->>'scene_type' AS scene_type,
           gps.id AS sync_id, gps.synced_at
    FROM media_assets ma
    LEFT JOIN gbp_photo_sync gps ON gps.media_asset_id = ma.id AND gps.site_id = ${siteId}
    WHERE ma.site_id = ${siteId}
      AND (ma.media_type LIKE 'image/%' OR ma.media_type = 'image')
      AND ma.triage_status IN ('triaged', 'consumed', 'scheduled', 'received')
      AND COALESCE(ma.metadata->>'gbp_upload_failed', 'false') != 'true'
    ORDER BY ma.quality_score DESC NULLS LAST
  `;

  const [gbpConnected] = await sql`
    SELECT 1 FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status IN ('active', 'token_expired')
    LIMIT 1
  `;

  // Cover + logo
  const [siteAssets] = await sql`
    SELECT gbp_cover_asset_id, business_logo FROM sites WHERE id = ${siteId}
  `;
  const coverAssetId = siteAssets?.gbp_cover_asset_id as string | null;
  const logoUrl = (siteAssets?.business_logo as string) || null;

  let coverUrl: string | null = null;
  if (coverAssetId) {
    const [a] = await sql`SELECT storage_url FROM media_assets WHERE id = ${coverAssetId}`;
    coverUrl = (a?.storage_url as string) || null;
  }

  // Blue ribbon = top 50 by quality
  const blueRibbonIds = new Set(
    allPhotos.slice(0, 50).map((p) => p.id as string)
  );

  const photos = allPhotos.map((p) => ({
    id: p.id as string,
    storageUrl: p.storage_url as string,
    qualityScore: Number(p.quality_score) || 0,
    contentPillar: (p.content_pillar as string) || null,
    sceneType: (p.scene_type as string) || null,
    isSynced: !!p.sync_id,
    syncedAt: (p.synced_at as string) || null,
    isBlueRibbon: blueRibbonIds.has(p.id as string),
  }));

  const syncedCount = photos.filter((p) => p.isSynced).length;
  const blueRibbonCount = photos.filter((p) => p.isBlueRibbon).length;

  return (
    <PhotosClient
      siteId={siteId}
      connected={!!gbpConnected}
      photos={photos}
      coverUrl={coverUrl}
      logoUrl={logoUrl}
      coverAssetId={coverAssetId}
      syncedCount={syncedCount}
      blueRibbonCount={blueRibbonCount}
      totalCount={photos.length}
    />
  );
}
