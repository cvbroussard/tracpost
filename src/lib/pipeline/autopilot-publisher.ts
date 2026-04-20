/**
 * Autopilot publisher — the publish-then-notify engine.
 *
 * No slots, no drafts, no approval. The cadence config says WHEN.
 * The asset queue says WHAT. Quality gates decide IF. Posts are
 * born and published in the same function call.
 *
 * Called by the pipeline cron every hour.
 */
import "server-only";
import { sql } from "@/lib/db";
import { loadCadenceConfig, shouldPublishNow, getActiveCampaign } from "./cadence";
import { runGates, quarantineAsset } from "./quality-gates";
import { publishPost } from "./publisher";
import { decrypt } from "@/lib/crypto";

interface PublishResult {
  platform: string;
  published: boolean;
  reason?: string;
  postId?: string;
  quarantined?: boolean;
}

/**
 * Select the next best asset to publish for a platform.
 *
 * Queue logic:
 *  - Must be triaged (not quarantined, not shelved)
 *  - Must have quality >= threshold
 *  - Must not have been published to this platform already
 *  - Must have a rendered variant for this platform
 *  - Campaign assets weighted first, then quality × recency
 *  - Content pillar diversity: skip if same pillar as last 2 posts
 */
async function selectNextAsset(
  siteId: string,
  platform: string,
  opts: {
    boostPillars?: string[];
    qualityThreshold?: number;
  } = {},
): Promise<Record<string, unknown> | null> {
  const threshold = opts.qualityThreshold || 0.5;

  // Get the last 2 published pillars for diversity
  const recentPillars = await sql`
    SELECT ma.content_pillar
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    LEFT JOIN media_assets ma ON ma.id = sp.source_asset_id
    WHERE ssl.site_id = ${siteId}
      AND sa.platform = ${platform}
      AND sp.status = 'published'
    ORDER BY sp.published_at DESC
    LIMIT 2
  `;
  const lastPillars = [...new Set(recentPillars.map((r) => String(r.content_pillar)))];

  // Build boost clause for campaign pillars
  const boostCase = opts.boostPillars && opts.boostPillars.length > 0
    ? `CASE WHEN content_pillar = ANY(ARRAY[${opts.boostPillars.map((p) => `'${p}'`).join(",")}]) THEN 1 ELSE 0 END`
    : "0";

  // Select the best candidate
  const candidates = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.content_pillar,
           ma.media_type,
           ma.metadata->'generated_text'->>'context_note' AS gen_caption,
           ma.metadata->'generated_text'->>'social_hook' AS social_hook,
           ma.metadata->'generated_text'->>'pin_headline' AS pin_headline,
           ma.variants
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status = 'triaged'
      AND ma.quality_score >= ${threshold}
      AND ma.media_type LIKE 'image%'
      AND ma.render_status = 'rendered'
      AND NOT EXISTS (
        SELECT 1 FROM social_posts sp
        JOIN social_accounts sa ON sp.account_id = sa.id
        WHERE sp.source_asset_id = ma.id
          AND sa.platform = ${platform}
          AND sp.status IN ('published', 'scheduled')
      )
    ORDER BY ma.quality_score DESC, ma.created_at DESC
    LIMIT 10
  `;

  if (candidates.length === 0) return null;

  // Prefer candidates NOT matching the last 2 pillars (diversity)
  const diverse = candidates.filter(
    (c) => !lastPillars.includes(String(c.content_pillar)),
  );

  // Prefer campaign-boosted pillars
  if (opts.boostPillars && opts.boostPillars.length > 0) {
    const boosted = (diverse.length > 0 ? diverse : candidates).filter(
      (c) => opts.boostPillars!.includes(String(c.content_pillar)),
    );
    if (boosted.length > 0) return boosted[0];
  }

  return diverse.length > 0 ? diverse[0] : candidates[0];
}

const VIDEO_ONLY_PLATFORMS = new Set(["tiktok", "youtube"]);

/**
 * Select a video from the pre-generated pool for a platform.
 * Prefers videos not yet published to this platform, then least-used overall.
 * Returns null if pool is empty — publisher skips, never generates inline.
 */
async function selectPoolVideo(
  siteId: string,
  platform: string,
): Promise<Record<string, unknown> | null> {
  const [video] = await sql`
    SELECT ma.id, ma.storage_url, ma.quality_score, ma.content_pillar,
           ma.metadata->'generated_text'->>'context_note' AS gen_caption,
           ma.metadata->'generated_text'->>'social_hook' AS social_hook,
           ma.metadata->'generated_text'->>'pin_headline' AS pin_headline,
           ma.metadata->'generated_text'->>'display_caption' AS display_caption,
           ma.context_note,
           ma.source_asset_id
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.source = 'ai_generated'
      AND ma.media_type = 'video'
      AND ma.triage_status IN ('triaged', 'consumed')
      AND NOT EXISTS (
        SELECT 1 FROM social_posts sp
        JOIN social_accounts sa ON sp.account_id = sa.id
        WHERE sp.source_asset_id = ma.id
          AND sa.platform = ${platform}
          AND sp.status IN ('published', 'scheduled')
      )
    ORDER BY
      (SELECT COUNT(*) FROM social_posts sp WHERE sp.source_asset_id = ma.id AND sp.status = 'published') ASC,
      ma.quality_score DESC,
      ma.created_at DESC
    LIMIT 1
  `;
  return video || null;
}

/**
 * Get the platform-specific caption for an asset.
 * Uses generated_text fields based on platform conventions.
 */
function getPlatformCaption(
  asset: Record<string, unknown>,
  platform: string,
): string {
  const genCaption = (asset.gen_caption as string) || "";
  const socialHook = (asset.social_hook as string) || "";
  const pinHeadline = (asset.pin_headline as string) || "";

  switch (platform) {
    case "twitter":
      // Short: social hook only (fits 280 chars)
      return socialHook || genCaption.slice(0, 250);
    case "pinterest":
      // SEO-focused: pin headline + description
      return pinHeadline ? `${pinHeadline}\n\n${genCaption}` : genCaption;
    case "linkedin":
      // Professional: full caption
      return genCaption;
    case "instagram":
    case "tiktok":
      // Hook first, then caption
      return socialHook && genCaption
        ? `${socialHook}\n\n${genCaption}`
        : genCaption || socialHook;
    default:
      return genCaption || socialHook;
  }
}

/**
 * Get the platform-specific media URL from rendered variants.
 */
function getVariantUrl(asset: Record<string, unknown>, platform: string): string | null {
  const variants = (asset.variants || {}) as Record<string, { url: string }>;
  const variant = variants[platform] || variants.blog;
  return variant?.url || (asset.storage_url ? String(asset.storage_url) : null);
}

/**
 * Publish content for one site across all platforms.
 * Called by the pipeline cron every hour.
 */
export async function autopilotPublish(siteId: string, opts: { force?: boolean; platform?: string | null } = {}): Promise<PublishResult[]> {
  const config = await loadCadenceConfig(siteId);
  const results: PublishResult[] = [];

  // Get connected platform accounts
  const accounts = await sql`
    SELECT sa.id AS account_id, sa.platform, sa.access_token_encrypted,
           sa.metadata AS account_metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
  `;

  const dateStr = new Date().toISOString().slice(0, 10);
  const campaign = getActiveCampaign(config, dateStr);

  for (const account of accounts) {
    const platform = String(account.platform);

    // Platform filter — admin can target a single platform for testing
    if (opts.platform && platform !== opts.platform) {
      continue;
    }

    // Skip platforms with 3+ consecutive recent failures (unless admin force)
    if (!opts.force) {
      const [recentFailures] = await sql`
        SELECT COUNT(*)::int AS fail_count
        FROM (
          SELECT status FROM social_posts
          WHERE account_id = ${account.account_id}
          ORDER BY created_at DESC
          LIMIT 3
        ) recent
        WHERE status = 'failed'
      `;
      if (recentFailures?.fail_count >= 3) {
        results.push({ platform, published: false, reason: "Skipped — 3+ consecutive failures. Reconnect or refresh token." });
        continue;
      }
    }

    // Should we publish now? (admin force bypasses cadence gates)
    if (!opts.force) {
      const cadenceCheck = await shouldPublishNow(siteId, platform, config);
      if (!cadenceCheck.publish) {
        results.push({ platform, published: false, reason: cadenceCheck.reason });
        continue;
      }
    }

    // Select the next best asset using site-relative thresholds
    const { getThresholds, publishAbove } = await import("./quality-thresholds");
    const thresholds = await getThresholds(siteId);
    const asset = await selectNextAsset(siteId, platform, {
      boostPillars: campaign?.boost_pillars,
      qualityThreshold: publishAbove(thresholds),
    });

    if (!asset) {
      results.push({ platform, published: false, reason: "No content available" });
      continue;
    }

    let assetId = String(asset.id);
    let caption = getPlatformCaption(asset, platform);
    let mediaUrl = getVariantUrl(asset, platform);
    let mediaType = String(asset.media_type || "image");

    // Video-only platforms: select from pre-generated pool (never generate inline)
    if (VIDEO_ONLY_PLATFORMS.has(platform)) {
      const poolVideo = await selectPoolVideo(siteId, platform);
      if (poolVideo) {
        mediaUrl = String(poolVideo.storage_url);
        caption = getPlatformCaption(poolVideo, platform);
        mediaType = "video";
        assetId = String(poolVideo.id);
      } else {
        results.push({ platform, published: false, reason: "Video pool empty — waiting for next generation cycle" });
        continue;
      }
    }

    if (!mediaUrl) {
      results.push({ platform, published: false, reason: "No rendered variant" });
      continue;
    }

    // Run quality gates with site-relative threshold
    const gates = await runGates(assetId, caption, { qualityThreshold: publishAbove(thresholds) });
    if (!gates.pass) {
      const redFlags = gates.flags.filter((f) => f.severity === "red");
      await quarantineAsset(assetId, redFlags.map((f) => f.reason).join("; "));
      results.push({
        platform,
        published: false,
        reason: `Quarantined: ${redFlags[0]?.reason}`,
        quarantined: true,
      });
      continue;
    }

    // Create the social post and publish immediately
    try {
      const [post] = await sql`
        INSERT INTO social_posts (
          account_id, source_asset_id, caption, media_urls, media_type,
          status, scheduled_at, published_at, ai_generated
        )
        VALUES (
          ${account.account_id}, ${assetId}, ${caption},
          ARRAY[${mediaUrl}], ${mediaType},
          'scheduled', NOW(), NULL, true
        )
        RETURNING id
      `;

      // Publish via adapter
      const publishResult = await publishPost(String(post.id));

      if (publishResult.success) {
        results.push({ platform, published: true, postId: String(post.id) });
      } else {
        // Auto-flag token issues to prevent future attempts
        const errMsg = (publishResult.error || "").toLowerCase();
        if (errMsg.includes("token") || errMsg.includes("401") || errMsg.includes("auth") || errMsg.includes("expired") || errMsg.includes("oauth")) {
          await sql`UPDATE social_accounts SET status = 'token_expired', updated_at = NOW() WHERE id = ${account.account_id}`;
        }
        results.push({
          platform,
          published: false,
          reason: publishResult.error || "Publish failed",
          postId: String(post.id),
        });
      }
    } catch (err) {
      results.push({
        platform,
        published: false,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}
