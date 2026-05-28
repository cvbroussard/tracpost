/**
 * Instant Import — historical posts/media for IG, FB, GBP.
 *
 * One-time backfill of the subscriber's existing platform footprint into
 * the historical_posts table. Pulled content lives separately from
 * media_assets and never feeds the publisher (see storage architecture
 * memory). Reference + brand-DNA derivation only.
 *
 * Per-platform caps keep storage bounded. CDN URLs are rehosted to R2
 * since IG/FB URLs expire.
 */
import "server-only";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { rehostFromUrl, extFromUrl } from "./rehost";

interface HistoricalImportResult {
  imported: boolean;
  count: number;
  skipped?: number;
  reason?: string;
}

interface AssetRow {
  asset_id: string;
  platform: string;
  platform_native_id: string;
  asset_metadata: Record<string, unknown>;
  access_token_encrypted: string;
  primary_site_id: string | null;
  subscription_id: string;
}

// ── Caps per platform ─────────────────────────────────────────────────────
const IG_MAX_MEDIA = 60;
const FB_MAX_POSTS = 30;
const GBP_MAX_PHOTOS = 100;

// ── Idempotent insert helper ──────────────────────────────────────────────
async function recordHistoricalPost(input: {
  subscriptionId: string;
  siteId: string | null;
  platformAssetId: string;
  platform: string;
  sourcePlatformId: string;
  postType: string;
  caption: string | null;
  sourceUrl: string | null;
  storageUrl: string;
  thumbnailUrl: string | null;
  postedAt: string | null;
  likeCount?: number | null;
  commentCount?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const inserted = await sql`
    INSERT INTO historical_posts (
      billing_account_id, business_id, platform_asset_id, platform,
      source_platform_id, post_type, caption, source_url,
      storage_url, thumbnail_url, posted_at,
      like_count, comment_count, width, height, duration_ms,
      metadata
    ) VALUES (
      ${input.subscriptionId}, ${input.siteId}, ${input.platformAssetId}, ${input.platform},
      ${input.sourcePlatformId}, ${input.postType}, ${input.caption}, ${input.sourceUrl},
      ${input.storageUrl}, ${input.thumbnailUrl}, ${input.postedAt},
      ${input.likeCount ?? null}, ${input.commentCount ?? null},
      ${input.width ?? null}, ${input.height ?? null}, ${input.durationMs ?? null},
      ${JSON.stringify(input.metadata || {})}
    )
    ON CONFLICT (platform, source_platform_id) DO NOTHING
    RETURNING id
  `;
  return inserted.length > 0;
}

// ── Instagram media ───────────────────────────────────────────────────────
export async function importInstagramMedia(asset: AssetRow): Promise<HistoricalImportResult> {
  if (!asset.primary_site_id) return { imported: false, count: 0, reason: "no primary site assigned" };

  const userToken = decrypt(asset.access_token_encrypted);
  const pageToken = (asset.asset_metadata?.page_access_token as string) || userToken;

  const fields = "id,permalink,timestamp,caption,media_type,media_url,thumbnail_url,like_count,comments_count";
  const url = `https://graph.facebook.com/v23.0/${asset.platform_native_id}/media?fields=${fields}&limit=${IG_MAX_MEDIA}&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`IG media fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const items = (data.data || []) as Array<Record<string, unknown>>;

  let count = 0, skipped = 0;
  for (const m of items) {
    const id = String(m.id);
    const mediaType = String(m.media_type || "IMAGE").toLowerCase();
    const mediaUrl = (m.media_url as string) || (m.thumbnail_url as string) || null;
    if (!mediaUrl) { skipped++; continue; }

    const postType = mediaType === "video" ? "video" : mediaType === "carousel_album" ? "carousel" : "photo";
    const ext = extFromUrl(mediaUrl, postType === "video" ? "mp4" : "jpg");
    const key = `sites/${asset.primary_site_id}/historical/instagram/${id}.${ext}`;

    try {
      const storageUrl = await rehostFromUrl(mediaUrl, key);
      const wasNew = await recordHistoricalPost({
        subscriptionId: asset.subscription_id,
        siteId: asset.primary_site_id,
        platformAssetId: asset.asset_id,
        platform: "instagram",
        sourcePlatformId: id,
        postType,
        caption: (m.caption as string) || null,
        sourceUrl: (m.permalink as string) || null,
        storageUrl,
        thumbnailUrl: (m.thumbnail_url as string) || null,
        postedAt: (m.timestamp as string) || null,
        likeCount: typeof m.like_count === "number" ? m.like_count : null,
        commentCount: typeof m.comments_count === "number" ? m.comments_count : null,
        metadata: { media_type: m.media_type },
      });
      if (wasNew) count++; else skipped++;
    } catch (err) {
      console.error(`IG rehost failed for ${id}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { imported: count > 0, count, skipped };
}

// ── Facebook page posts (with media attachments) ─────────────────────────
export async function importFacebookPosts(asset: AssetRow): Promise<HistoricalImportResult> {
  if (!asset.primary_site_id) return { imported: false, count: 0, reason: "no primary site assigned" };

  const userToken = decrypt(asset.access_token_encrypted);
  const pageToken = (asset.asset_metadata?.page_access_token as string) || userToken;

  const fields = "id,permalink_url,created_time,message,attachments{type,media,subattachments,url}";
  const url = `https://graph.facebook.com/v23.0/${asset.platform_native_id}/posts?fields=${fields}&limit=${FB_MAX_POSTS}&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`FB posts fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const posts = (data.data || []) as Array<Record<string, unknown>>;

  let count = 0, skipped = 0;
  for (const post of posts) {
    const postId = String(post.id);
    const attachments = (post.attachments as Record<string, unknown> | undefined)?.data as Array<Record<string, unknown>> | undefined;
    const att = attachments?.[0];
    if (!att) { skipped++; continue; }

    // Pull either the main media OR the first subattachment (photo album case)
    const subatt = ((att.subattachments as Record<string, unknown> | undefined)?.data as Array<Record<string, unknown>> | undefined)?.[0];
    const candidate = subatt || att;
    const mediaSrc = ((candidate.media as Record<string, unknown> | undefined)?.image as Record<string, unknown> | undefined)?.src as string | undefined;
    if (!mediaSrc) { skipped++; continue; }

    const attType = String(att.type || "photo");
    const postType = attType.includes("video") ? "video" : attType === "album" ? "carousel" : "photo";
    const ext = extFromUrl(mediaSrc, "jpg");
    const key = `sites/${asset.primary_site_id}/historical/facebook/${postId.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;

    try {
      const storageUrl = await rehostFromUrl(mediaSrc, key);
      const wasNew = await recordHistoricalPost({
        subscriptionId: asset.subscription_id,
        siteId: asset.primary_site_id,
        platformAssetId: asset.asset_id,
        platform: "facebook",
        sourcePlatformId: postId,
        postType,
        caption: (post.message as string) || null,
        sourceUrl: (post.permalink_url as string) || null,
        storageUrl,
        thumbnailUrl: null,
        postedAt: (post.created_time as string) || null,
        metadata: { attachment_type: attType },
      });
      if (wasNew) count++; else skipped++;
    } catch (err) {
      console.error(`FB rehost failed for ${postId}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { imported: count > 0, count, skipped };
}

// ── GBP photos ────────────────────────────────────────────────────────────
export async function importGbpPhotos(asset: AssetRow): Promise<HistoricalImportResult> {
  if (!asset.primary_site_id) return { imported: false, count: 0, reason: "no primary site assigned" };

  const accessToken = decrypt(asset.access_token_encrypted);
  const accountId = (asset.asset_metadata?.accountId as string)
    || (asset.asset_metadata?.account_id as string) || "";
  const locationPart = asset.platform_native_id.startsWith("locations/")
    ? asset.platform_native_id
    : `locations/${asset.platform_native_id}`;
  const path = accountId ? `${accountId}/${locationPart}` : locationPart;

  // v4 GBP media list — returns up to 100 by default
  const url = `https://mybusiness.googleapis.com/v4/${path}/media?pageSize=${GBP_MAX_PHOTOS}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GBP media fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const photos = (data.mediaItems || []) as Array<Record<string, unknown>>;

  let count = 0, skipped = 0;
  for (const p of photos) {
    const id = (p.name as string) || (p.googleUrl as string) || "";
    if (!id) { skipped++; continue; }
    const sourceUrl = (p.sourceUrl as string) || (p.googleUrl as string) || ((p.dimensions as Record<string, unknown> | undefined)?.url as string) || "";
    if (!sourceUrl) { skipped++; continue; }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-60);
    const ext = extFromUrl(sourceUrl, "jpg");
    const key = `sites/${asset.primary_site_id}/historical/gbp/${safeId}.${ext}`;

    try {
      const storageUrl = await rehostFromUrl(sourceUrl, key);
      const dims = (p.dimensions as Record<string, unknown> | undefined) || {};
      const wasNew = await recordHistoricalPost({
        subscriptionId: asset.subscription_id,
        siteId: asset.primary_site_id,
        platformAssetId: asset.asset_id,
        platform: "gbp",
        sourcePlatformId: id,
        postType: "photo",
        caption: (p.description as string) || null,
        sourceUrl: (p.googleUrl as string) || null,
        storageUrl,
        thumbnailUrl: (p.thumbnailUrl as string) || null,
        postedAt: (p.createTime as string) || null,
        width: typeof dims.widthPixels === "number" ? dims.widthPixels : null,
        height: typeof dims.heightPixels === "number" ? dims.heightPixels : null,
        metadata: {
          media_format: p.mediaFormat,
          location_association: p.locationAssociation,
        },
      });
      if (wasNew) count++; else skipped++;
    } catch (err) {
      console.error(`GBP rehost failed for ${id}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { imported: count > 0, count, skipped };
}
