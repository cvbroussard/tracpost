import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * GBP Media API — photo gallery management.
 *
 * Uses My Business Business Information API v1 for media operations:
 *   - List: GET accounts/{id}/locations/{id}/media
 *   - Create: POST accounts/{id}/locations/{id}/media
 *   - Delete: DELETE accounts/{id}/locations/{id}/media/{mediaId}
 *   - Patch: PATCH accounts/{id}/locations/{id}/media/{mediaId} (cover/logo)
 *
 * Photo categories map from triage content analysis to GBP media categories:
 *   EXTERIOR, INTERIOR, PRODUCT, AT_WORK, TEAMS, FOOD_AND_DRINK, COMMON_AREAS
 */

const GBP_API = "https://mybusiness.googleapis.com/v4";

export type GbpMediaCategory =
  | "EXTERIOR"
  | "INTERIOR"
  | "PRODUCT"
  | "AT_WORK"
  | "TEAMS"
  | "FOOD_AND_DRINK"
  | "COMMON_AREAS"
  | "ADDITIONAL";

export interface GbpMediaItem {
  name: string;
  mediaFormat: "PHOTO" | "VIDEO";
  sourceUrl: string;
  googleUrl?: string;
  thumbnailUrl?: string;
  category: GbpMediaCategory;
  description?: string;
  createTime: string;
  dimensions?: { widthPixels: number; heightPixels: number };
  insights?: { viewCount: string };
}

export interface GbpPhotoSync {
  id: string;
  site_id: string;
  media_asset_id: string | null;
  gbp_media_name: string;
  gbp_media_url: string | null;
  source_url: string;
  category: GbpMediaCategory;
  media_type: string;
  synced_at: string;
}

const PILLAR_TO_GBP_CATEGORY: Record<string, GbpMediaCategory> = {
  result: "PRODUCT",
  training_action: "AT_WORK",
  showcase: "PRODUCT",
  educational: "AT_WORK",
};

const SCENE_TO_GBP_CATEGORY: Record<string, GbpMediaCategory> = {
  environment: "INTERIOR",
  product: "PRODUCT",
  method: "AT_WORK",
  humans: "AT_WORK",
  region: "EXTERIOR",
};

export function mapToGbpCategory(
  contentPillar: string | null,
  sceneType: string | null,
): GbpMediaCategory {
  if (contentPillar && PILLAR_TO_GBP_CATEGORY[contentPillar]) {
    return PILLAR_TO_GBP_CATEGORY[contentPillar];
  }
  if (sceneType && SCENE_TO_GBP_CATEGORY[sceneType]) {
    return SCENE_TO_GBP_CATEGORY[sceneType];
  }
  return "ADDITIONAL";
}

function buildLocationPath(accountMetadata: Record<string, unknown>, platformAccountId: string): string {
  const gbpAccountId = (accountMetadata?.account_id as string) || "";
  return gbpAccountId && platformAccountId
    ? `${gbpAccountId}/${platformAccountId}`
    : platformAccountId;
}

export async function listGbpPhotos(
  accessToken: string,
  locationPath: string,
): Promise<GbpMediaItem[]> {
  const items: GbpMediaItem[] = [];
  let pageToken: string | undefined;

  do {
    let url = `${GBP_API}/${locationPath}/media?pageSize=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("GBP listMedia failed:", err);
      break;
    }

    const data = await res.json();
    if (data.mediaItems) {
      items.push(...data.mediaItems);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

export async function uploadGbpPhoto(
  accessToken: string,
  locationPath: string,
  sourceUrl: string,
  category: GbpMediaCategory,
  description?: string,
): Promise<{ name: string; googleUrl?: string } | null> {
  const body: Record<string, unknown> = {
    mediaFormat: "PHOTO",
    sourceUrl,
    locationAssociation: { category },
  };
  if (description) {
    body.description = description;
  }

  const res = await fetch(`${GBP_API}/${locationPath}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("GBP uploadPhoto failed:", err);
    return null;
  }

  const data = await res.json();
  return { name: data.name, googleUrl: data.googleUrl };
}

export async function deleteGbpPhoto(
  accessToken: string,
  mediaName: string,
): Promise<boolean> {
  const res = await fetch(`${GBP_API}/${mediaName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

export async function setGbpCoverOrLogo(
  accessToken: string,
  locationPath: string,
  sourceUrl: string,
  type: "COVER" | "LOGO",
): Promise<{ name: string; googleUrl?: string } | null> {
  const category = type === "COVER" ? "COVER" : "LOGO";
  const body = {
    mediaFormat: "PHOTO",
    sourceUrl,
    locationAssociation: { category },
  };

  const res = await fetch(`${GBP_API}/${locationPath}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`GBP set${type} failed:`, err);
    return null;
  }

  const data = await res.json();
  return { name: data.name, googleUrl: data.googleUrl };
}

/**
 * Auto-sync eligible media assets to GBP gallery.
 * Called after quality gates pass in the pipeline.
 */
export async function autoSyncPhotos(siteId: string): Promise<{ synced: number; skipped: number }> {
  const [gbpAccount] = await sql`
    SELECT sa.id, sa.account_id, sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!gbpAccount) return { synced: 0, skipped: 0 };

  const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
  const metadata = gbpAccount.metadata as Record<string, unknown>;
  const locationPath = buildLocationPath(metadata, gbpAccount.account_id);

  // Use site-relative publish threshold
  const { getThresholds, publishAbove } = await import("@/lib/pipeline/quality-thresholds");
  const qt = await getThresholds(siteId);
  const minQuality = publishAbove(qt);

  // Find eligible assets not yet synced
  const eligible = await sql`
    SELECT ma.id, ma.storage_url, ma.content_pillar, ma.quality_score,
           ma.ai_analysis, ma.metadata AS asset_metadata
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status = 'triaged'
      AND ma.quality_score >= ${minQuality}
      AND ma.media_type LIKE 'image/%'
      AND NOT EXISTS (
        SELECT 1 FROM gbp_photo_sync gps
        WHERE gps.media_asset_id = ma.id AND gps.site_id = ${siteId}
      )
    ORDER BY ma.quality_score DESC
    LIMIT 20
  `;

  let synced = 0;
  let skipped = 0;

  for (const asset of eligible) {
    try {
      const analysis = asset.ai_analysis as Record<string, unknown> | null;
      const sceneType = (analysis?.scene_type as string) || null;
      const category = mapToGbpCategory(asset.content_pillar, sceneType);
      const description = (analysis?.description as string) || undefined;

      const result = await uploadGbpPhoto(
        accessToken,
        locationPath,
        asset.storage_url,
        category,
        description,
      );

      if (result) {
        await sql`
          INSERT INTO gbp_photo_sync (site_id, media_asset_id, gbp_media_name, gbp_media_url, source_url, category, media_type)
          VALUES (${siteId}, ${asset.id}, ${result.name}, ${result.googleUrl || null}, ${asset.storage_url}, ${category}, 'PHOTO')
        `;
        synced++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`GBP photo sync failed for asset ${asset.id}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { synced, skipped };
}

/**
 * Pull existing GBP photos into sync table for display.
 */
export async function pullGbpPhotos(siteId: string): Promise<number> {
  const [gbpAccount] = await sql`
    SELECT sa.id, sa.account_id, sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!gbpAccount) return 0;

  const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
  const metadata = gbpAccount.metadata as Record<string, unknown>;
  const locationPath = buildLocationPath(metadata, gbpAccount.account_id);

  const items = await listGbpPhotos(accessToken, locationPath);
  let added = 0;

  for (const item of items) {
    const [existing] = await sql`
      SELECT id FROM gbp_photo_sync WHERE gbp_media_name = ${item.name} AND site_id = ${siteId}
    `;
    if (existing) continue;

    await sql`
      INSERT INTO gbp_photo_sync (site_id, gbp_media_name, gbp_media_url, source_url, category, media_type, synced_at)
      VALUES (
        ${siteId},
        ${item.name},
        ${item.googleUrl || item.thumbnailUrl || null},
        ${item.sourceUrl || ''},
        ${((item as unknown as Record<string, unknown>).locationAssociation as Record<string, string>)?.category || 'ADDITIONAL'},
        ${item.mediaFormat || 'PHOTO'},
        ${item.createTime || new Date().toISOString()}
      )
    `;
    added++;
  }

  return added;
}
