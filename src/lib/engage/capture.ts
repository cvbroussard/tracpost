/**
 * Engagement capture pipeline.
 *
 * Polls each migrated platform_asset for new engagement events and records
 * them in engagement_events. Run hourly via the pipeline cron.
 *
 * Started with the lowest-friction surfaces: GBP reviews, Instagram comments
 * on recent posts, Facebook comments on recent Page posts. Other surfaces
 * (mentions, tags, DMs, story mentions) get added incrementally.
 */
import "server-only";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { recordEngagementEvent } from "./events";

interface AssetWithToken {
  asset_id: string;
  asset_name: string;
  asset_metadata: Record<string, unknown>;
  social_account_id: string;
  subscription_id: string;
  oauth_provider: string;
  access_token_encrypted: string;
  platform_native_id: string; // pa.asset_id (Page ID, IG user ID, location ID)
  platform: string;            // pa.platform (facebook/instagram/gbp)
  primary_site_id: string | null;
}

/**
 * Get all healthy migrated platform_assets with their parent token + the
 * site_id of their primary assignment (if any).
 */
async function getCaptureTargets(): Promise<AssetWithToken[]> {
  const rows = await sql`
    SELECT pa.id AS asset_id, pa.asset_name, pa.metadata AS asset_metadata,
           pa.platform, pa.asset_id AS platform_native_id,
           sa.id AS social_account_id, sa.subscription_id,
           sa.platform AS oauth_provider, sa.access_token_encrypted,
           (SELECT spa.site_id FROM site_platform_assets spa
            WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
            LIMIT 1) AS primary_site_id
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.health_status IN ('healthy', 'unknown')
      AND sa.status = 'active'
  `;
  return rows.map((r) => ({
    asset_id: r.asset_id as string,
    asset_name: r.asset_name as string,
    asset_metadata: (r.asset_metadata || {}) as Record<string, unknown>,
    social_account_id: r.social_account_id as string,
    subscription_id: r.subscription_id as string,
    oauth_provider: r.oauth_provider as string,
    access_token_encrypted: r.access_token_encrypted as string,
    platform_native_id: r.platform_native_id as string,
    platform: r.platform as string,
    primary_site_id: r.primary_site_id as string | null,
  }));
}

/**
 * Log a capture run for debugging.
 */
async function logRun(
  assetId: string,
  captureType: string,
  result: { captured: number; new: number; cursor?: string | null; durationMs: number; error?: string }
) {
  await sql`
    INSERT INTO engagement_capture_runs (
      platform_asset_id, capture_type, cursor_returned,
      events_captured, events_new, duration_ms, error
    )
    VALUES (
      ${assetId}, ${captureType}, ${result.cursor || null},
      ${result.captured}, ${result.new}, ${result.durationMs}, ${result.error || null}
    )
  `;
}

// ─── GBP Reviews ───────────────────────────────────────────────────────────

async function captureGbpReviews(target: AssetWithToken): Promise<{ captured: number; new: number }> {
  const accessToken = decrypt(target.access_token_encrypted);
  const accountId = (target.asset_metadata?.accountId as string)
    || (target.asset_metadata?.account_id as string) || "";
  const locationPart = target.platform_native_id.startsWith("locations/")
    ? target.platform_native_id
    : `locations/${target.platform_native_id}`;
  const path = accountId ? `${accountId}/${locationPart}` : locationPart;

  const url = `https://mybusiness.googleapis.com/v4/${path}/reviews?pageSize=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GBP reviews fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const reviews = (data.reviews || []) as Array<Record<string, unknown>>;

  let newCount = 0;
  for (const r of reviews) {
    const reviewer = (r.reviewer || {}) as Record<string, string>;
    const starRating = String(r.starRating || "").toUpperCase();
    const sentimentMap: Record<string, "positive" | "neutral" | "negative"> = {
      FIVE: "positive", FOUR: "positive", THREE: "neutral",
      TWO: "negative", ONE: "negative",
    };

    const wasNew = await recordEngagementEvent({
      subscriptionId: target.subscription_id,
      siteId: target.primary_site_id,
      platformAssetId: target.asset_id,
      platform: "gbp",
      eventType: "review",
      targetType: "listing",
      platformTargetId: String(r.reviewId || r.name || ""),
      body: (r.comment as string) || null,
      sentiment: sentimentMap[starRating] || null,
      occurredAt: (r.createTime as string) || new Date().toISOString(),
      personDisplayName: reviewer.displayName || "Google User",
      personPlatformUserId: String(r.reviewId || reviewer.profilePhotoUrl || "anonymous"),
      personAvatarUrl: reviewer.profilePhotoUrl || null,
      metadata: { star_rating: starRating, raw: r },
    });
    if (wasNew) newCount++;
  }

  return { captured: reviews.length, new: newCount };
}

// ─── Instagram Comments on Recent Posts ───────────────────────────────────

async function captureInstagramComments(target: AssetWithToken): Promise<{ captured: number; new: number }> {
  const userToken = decrypt(target.access_token_encrypted);

  // Use page access token if present (preferred for IG via Pages API)
  const pageToken = (target.asset_metadata?.page_access_token as string) || userToken;

  // Get recent media (last 25 posts)
  const mediaUrl = `https://graph.facebook.com/v23.0/${target.platform_native_id}/media?fields=id,permalink,timestamp&limit=25&access_token=${encodeURIComponent(pageToken)}`;
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    const errText = await mediaRes.text();
    throw new Error(`IG media fetch failed (${mediaRes.status}): ${errText.slice(0, 200)}`);
  }
  const mediaData = await mediaRes.json();
  const posts = (mediaData.data || []) as Array<Record<string, unknown>>;

  let captured = 0;
  let newCount = 0;
  for (const post of posts) {
    const commentsUrl = `https://graph.facebook.com/v23.0/${post.id}/comments?fields=id,text,timestamp,username,from&limit=50&access_token=${encodeURIComponent(pageToken)}`;
    const cRes = await fetch(commentsUrl);
    if (!cRes.ok) continue;
    const cData = await cRes.json();
    const comments = (cData.data || []) as Array<Record<string, unknown>>;
    captured += comments.length;

    for (const c of comments) {
      const from = (c.from || {}) as Record<string, string>;
      const username = (c.username as string) || from.username || "unknown";
      const userId = from.id || (c.id as string);
      const wasNew = await recordEngagementEvent({
        subscriptionId: target.subscription_id,
        siteId: target.primary_site_id,
        platformAssetId: target.asset_id,
        platform: "instagram",
        eventType: "comment",
        targetType: "post",
        platformTargetId: String(c.id),
        body: (c.text as string) || null,
        permalink: post.permalink ? `${post.permalink}#${c.id}` : null,
        occurredAt: (c.timestamp as string) || new Date().toISOString(),
        personDisplayName: username,
        personPlatformUserId: userId,
        personHandle: username,
        metadata: { post_id: post.id },
      });
      if (wasNew) newCount++;
    }
  }

  return { captured, new: newCount };
}

// ─── Instagram Mentions (caption @mentions of the brand account) ─────────

async function captureInstagramMentions(target: AssetWithToken): Promise<{ captured: number; new: number }> {
  const userToken = decrypt(target.access_token_encrypted);
  const pageToken = (target.asset_metadata?.page_access_token as string) || userToken;

  const url = `https://graph.facebook.com/v23.0/${target.platform_native_id}/mentioned_media?fields=id,permalink,caption,timestamp,username,owner&limit=25&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`IG mentions fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const media = (data.data || []) as Array<Record<string, unknown>>;

  let newCount = 0;
  for (const m of media) {
    const owner = (m.owner || {}) as Record<string, string>;
    const username = (m.username as string) || owner.username || "unknown";
    const ownerId = owner.id || (m.id as string);
    const wasNew = await recordEngagementEvent({
      subscriptionId: target.subscription_id,
      siteId: target.primary_site_id,
      platformAssetId: target.asset_id,
      platform: "instagram",
      eventType: "mention",
      targetType: "post",
      platformTargetId: String(m.id),
      body: (m.caption as string) || null,
      permalink: (m.permalink as string) || null,
      occurredAt: (m.timestamp as string) || new Date().toISOString(),
      personDisplayName: username,
      personPlatformUserId: ownerId,
      personHandle: username,
      metadata: { source: "mentioned_media" },
    });
    if (wasNew) newCount++;
  }

  return { captured: media.length, new: newCount };
}

// ─── Instagram Tags (account tagged in another user's photo) ──────────────

async function captureInstagramTags(target: AssetWithToken): Promise<{ captured: number; new: number }> {
  const userToken = decrypt(target.access_token_encrypted);
  const pageToken = (target.asset_metadata?.page_access_token as string) || userToken;

  const url = `https://graph.facebook.com/v23.0/${target.platform_native_id}/tags?fields=id,permalink,caption,timestamp,username,owner&limit=25&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`IG tags fetch failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const media = (data.data || []) as Array<Record<string, unknown>>;

  let newCount = 0;
  for (const m of media) {
    const owner = (m.owner || {}) as Record<string, string>;
    const username = (m.username as string) || owner.username || "unknown";
    const ownerId = owner.id || (m.id as string);
    const wasNew = await recordEngagementEvent({
      subscriptionId: target.subscription_id,
      siteId: target.primary_site_id,
      platformAssetId: target.asset_id,
      platform: "instagram",
      eventType: "tag",
      targetType: "post",
      platformTargetId: String(m.id),
      body: (m.caption as string) || null,
      permalink: (m.permalink as string) || null,
      occurredAt: (m.timestamp as string) || new Date().toISOString(),
      personDisplayName: username,
      personPlatformUserId: ownerId,
      personHandle: username,
      metadata: { source: "tags" },
    });
    if (wasNew) newCount++;
  }

  return { captured: media.length, new: newCount };
}

// ─── Facebook Comments on Recent Page Posts ───────────────────────────────

async function captureFacebookComments(target: AssetWithToken): Promise<{ captured: number; new: number }> {
  const userToken = decrypt(target.access_token_encrypted);
  const pageToken = (target.asset_metadata?.page_access_token as string) || userToken;

  const postsUrl = `https://graph.facebook.com/v23.0/${target.platform_native_id}/posts?fields=id,permalink_url,created_time&limit=25&access_token=${encodeURIComponent(pageToken)}`;
  const postsRes = await fetch(postsUrl);
  if (!postsRes.ok) {
    const errText = await postsRes.text();
    throw new Error(`FB posts fetch failed (${postsRes.status}): ${errText.slice(0, 200)}`);
  }
  const postsData = await postsRes.json();
  const posts = (postsData.data || []) as Array<Record<string, unknown>>;

  let captured = 0;
  let newCount = 0;
  for (const post of posts) {
    const cUrl = `https://graph.facebook.com/v23.0/${post.id}/comments?fields=id,message,created_time,from{id,name,picture}&limit=50&access_token=${encodeURIComponent(pageToken)}`;
    const cRes = await fetch(cUrl);
    if (!cRes.ok) continue;
    const cData = await cRes.json();
    const comments = (cData.data || []) as Array<Record<string, unknown>>;
    captured += comments.length;

    for (const c of comments) {
      const from = (c.from || {}) as Record<string, unknown>;
      const fromId = (from.id as string) || (c.id as string);
      const fromName = (from.name as string) || "Facebook User";
      const picture = (from.picture as Record<string, Record<string, string>>)?.data?.url || null;

      const wasNew = await recordEngagementEvent({
        subscriptionId: target.subscription_id,
        siteId: target.primary_site_id,
        platformAssetId: target.asset_id,
        platform: "facebook",
        eventType: "comment",
        targetType: "post",
        platformTargetId: String(c.id),
        body: (c.message as string) || null,
        permalink: (post.permalink_url as string) || null,
        occurredAt: (c.created_time as string) || new Date().toISOString(),
        personDisplayName: fromName,
        personPlatformUserId: fromId,
        personAvatarUrl: picture,
        metadata: { post_id: post.id },
      });
      if (wasNew) newCount++;
    }
  }

  return { captured, new: newCount };
}

// ─── Top-Level Runner ─────────────────────────────────────────────────────

type Runner = (t: AssetWithToken) => Promise<{ captured: number; new: number }>;

const PLATFORM_RUNNERS: Record<string, Array<{ type: string; fn: Runner }>> = {
  gbp: [{ type: "reviews", fn: captureGbpReviews }],
  instagram: [
    { type: "comments", fn: captureInstagramComments },
    { type: "mentions", fn: captureInstagramMentions },
    { type: "tags", fn: captureInstagramTags },
  ],
  facebook: [{ type: "comments", fn: captureFacebookComments }],
};

/**
 * Run capture across all healthy assets. Called by the pipeline cron.
 * Each asset can run multiple capture types — every type is logged
 * separately to engagement_capture_runs.
 */
export async function captureAllEngagements(): Promise<{
  assets_processed: number;
  total_captured: number;
  total_new: number;
  errors: number;
}> {
  const targets = await getCaptureTargets();
  let total_captured = 0;
  let total_new = 0;
  let errors = 0;

  for (const target of targets) {
    const runners = PLATFORM_RUNNERS[target.platform];
    if (!runners) continue;

    for (const { type, fn } of runners) {
      const start = Date.now();
      try {
        const result = await fn(target);
        total_captured += result.captured;
        total_new += result.new;
        await logRun(target.asset_id, type, {
          captured: result.captured,
          new: result.new,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        errors++;
        await logRun(target.asset_id, type, {
          captured: 0,
          new: 0,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    assets_processed: targets.length,
    total_captured,
    total_new,
    errors,
  };
}
