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

  const synced = await sql`
    SELECT gps.id, gps.media_asset_id, gps.gbp_media_name, gps.gbp_media_url,
           gps.source_url, gps.category, gps.media_type, gps.synced_at,
           ma.quality_score, ma.content_pillar
    FROM gbp_photo_sync gps
    LEFT JOIN media_assets ma ON ma.id = gps.media_asset_id
    WHERE gps.site_id = ${siteId}
    ORDER BY gps.synced_at DESC
  `;

  const eligible = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.content_pillar,
           ma.ai_analysis, ma.created_at
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status = 'triaged'
      AND ma.quality_score >= 0.5
      AND (ma.media_type LIKE 'image/%' OR ma.media_type = 'image')
      AND NOT EXISTS (
        SELECT 1 FROM gbp_photo_sync gps
        WHERE gps.media_asset_id = ma.id AND gps.site_id = ${siteId}
      )
    ORDER BY ma.quality_score DESC
    LIMIT 50
  `;

  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total_synced,
      COUNT(*) FILTER (WHERE category = 'PRODUCT')::int AS product,
      COUNT(*) FILTER (WHERE category = 'AT_WORK')::int AS at_work,
      COUNT(*) FILTER (WHERE category = 'EXTERIOR')::int AS exterior,
      COUNT(*) FILTER (WHERE category = 'INTERIOR')::int AS interior,
      COUNT(*) FILTER (WHERE category = 'ADDITIONAL')::int AS additional
    FROM gbp_photo_sync
    WHERE site_id = ${siteId}
  `;

  const [gbpConnected] = await sql`
    SELECT 1 FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status IN ('active', 'token_expired')
    LIMIT 1
  `;

  // Cover + logo asset references
  const [siteAssets] = await sql`
    SELECT gbp_cover_asset_id, gbp_logo_asset_id FROM sites WHERE id = ${siteId}
  `;
  const coverAssetId = siteAssets?.gbp_cover_asset_id as string | null;
  const logoAssetId = siteAssets?.gbp_logo_asset_id as string | null;

  let coverUrl: string | null = null;
  let logoUrl: string | null = null;

  if (coverAssetId) {
    const [a] = await sql`SELECT storage_url FROM media_assets WHERE id = ${coverAssetId}`;
    coverUrl = (a?.storage_url as string) || null;
  }
  if (logoAssetId) {
    const [a] = await sql`SELECT storage_url FROM media_assets WHERE id = ${logoAssetId}`;
    logoUrl = (a?.storage_url as string) || null;
  }

  // All image assets for the picker
  const allImages = await sql`
    SELECT id, storage_url, quality_score, context_note
    FROM media_assets
    WHERE site_id = ${siteId}
      AND (media_type LIKE 'image/%' OR media_type = 'image')
      AND triage_status IN ('triaged', 'consumed', 'scheduled', 'received')
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 100
  `;

  return (
    <PhotosClient
      siteId={siteId}
      connected={!!gbpConnected}
      initialSynced={synced}
      initialEligible={eligible}
      allImages={allImages}
      coverUrl={coverUrl}
      logoUrl={logoUrl}
      coverAssetId={coverAssetId}
      logoAssetId={logoAssetId}
      stats={{
        total: (stats?.total_synced as number) ?? 0,
        product: (stats?.product as number) ?? 0,
        at_work: (stats?.at_work as number) ?? 0,
        exterior: (stats?.exterior as number) ?? 0,
        interior: (stats?.interior as number) ?? 0,
        additional: (stats?.additional as number) ?? 0,
      }}
    />
  );
}
