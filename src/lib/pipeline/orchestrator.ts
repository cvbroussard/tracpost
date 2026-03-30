import { sql } from "@/lib/db";
import { triageAsset } from "./triage";
import { generateSlots } from "./slot-generator";
import { fillSlots } from "./slot-filler";
import { generateMissingCaptions } from "./caption-generator";
import { publishDuePosts } from "./publisher";
import { generateMissingBlogPosts } from "./blog-generator";
import { sendPushNotification } from "@/lib/notifications";
import { syncInboxEngagement } from "@/lib/inbox/sync";
import { syncRssFeeds } from "@/lib/inbox/sync-rss";

export interface PipelineRunResult {
  siteId: string;
  rssItemsIngested: number;
  assetsTriaged: number;
  slotsGenerated: number;
  slotsFilled: number;
  captionsGenerated: number;
  blogPostsGenerated: number;
  postsPublished: number;
  postsFailed: number;
  inboxCommentsAdded: number;
  inboxReviewsAdded: number;
  errors: string[];
}

/**
 * Run the full autopilot pipeline for a site:
 * 1. Triage all "received" assets
 * 2. Generate publishing slots for the next 7 days
 * 3. Fill open slots with best available assets
 * 4. Generate captions for scheduled posts missing them
 * 5. Publish posts that are due (scheduled_at <= now)
 *
 * Designed to be called by a cron job (every 15 min)
 * or triggered on asset upload.
 */
export async function runPipeline(siteId: string): Promise<PipelineRunResult> {
  const result: PipelineRunResult = {
    siteId,
    rssItemsIngested: 0,
    assetsTriaged: 0,
    slotsGenerated: 0,
    slotsFilled: 0,
    captionsGenerated: 0,
    blogPostsGenerated: 0,
    postsPublished: 0,
    postsFailed: 0,
    inboxCommentsAdded: 0,
    inboxReviewsAdded: 0,
    errors: [],
  };

  // Gate: check that all "existing" accounts the subscriber owns are connected
  // before running the pipeline. New accounts created by admin can backfill later.
  const [siteRow] = await sql`
    SELECT metadata FROM sites WHERE id = ${siteId}
  `;
  const siteMeta = (siteRow?.metadata || {}) as Record<string, unknown>;
  const existingAccounts = (siteMeta.existing_accounts || []) as string[];

  if (existingAccounts.length > 0) {
    const connectedPlatforms = await sql`
      SELECT DISTINCT sa.platform
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
    `;
    const connected = new Set(connectedPlatforms.map((r) => r.platform as string));
    const missing = existingAccounts.filter((p) => !connected.has(p));
    if (missing.length > 0) {
      result.errors.push(`waiting: subscriber's existing accounts not yet connected: ${missing.join(", ")}`);
      return result;
    }
  }

  // Step 0: Sync RSS feeds (ingest new items before triage)
  try {
    result.rssItemsIngested = await syncRssFeeds(siteId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`rss-sync: ${msg}`);
  }

  // Step 1: Triage all received assets for this site
  const receivedAssets = await sql`
    SELECT id FROM media_assets
    WHERE site_id = ${siteId} AND triage_status = 'received'
    ORDER BY created_at ASC
    LIMIT 50
  `;

  for (const asset of receivedAssets) {
    try {
      await triageAsset(asset.id);
      result.assetsTriaged++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`triage(${asset.id}): ${msg}`);
    }
  }

  // Step 2: Generate slots for the next 7 days
  try {
    result.slotsGenerated = await generateSlots(siteId, 7);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`slot-gen: ${msg}`);
  }

  // Step 3: Fill open slots
  try {
    result.slotsFilled = await fillSlots(siteId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`slot-fill: ${msg}`);
  }

  // Step 4: Generate captions for posts that need them
  try {
    result.captionsGenerated = await generateMissingCaptions(siteId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`captions: ${msg}`);
  }

  // Step 5: Generate blog posts (only if playbook is sharpened — has subscriber angle)
  const [siteVoice] = await sql`
    SELECT brand_voice FROM sites WHERE id = ${siteId}
  `;
  const isSharpened = !!(siteVoice?.brand_voice as Record<string, unknown>)?._subscriberAngle;

  if (isSharpened) {
    try {
      result.blogPostsGenerated = await generateMissingBlogPosts(siteId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`blog-gen: ${msg}`);
    }
  }

  // Step 5.5: Promote recently published blog posts that haven't been promoted
  try {
    const { promoteBlogPost } = await import("./blog-promoter");
    const unpromoted = await sql`
      SELECT id FROM blog_posts
      WHERE site_id = ${siteId}
        AND status = 'published'
        AND promotion_status IS NULL
        AND published_at > NOW() - INTERVAL '24 hours'
      LIMIT 3
    `;
    for (const bp of unpromoted) {
      await promoteBlogPost(bp.id as string);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`blog-promote: ${msg}`);
  }

  // Step 6: Publish posts that are due
  try {
    const pubResult = await publishDuePosts(siteId);
    result.postsPublished = pubResult.published;
    result.postsFailed = pubResult.failed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`publish: ${msg}`);
  }

  // Step 7: Sync inbox engagement (comments + reviews)
  try {
    const inboxResult = await syncInboxEngagement(siteId);
    result.inboxCommentsAdded = inboxResult.commentsAdded;
    result.inboxReviewsAdded = inboxResult.reviewsAdded;
    result.errors.push(...inboxResult.errors);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`inbox-sync: ${msg}`);
  }

  // Send push notification if there are meaningful results
  await notifyPipelineResults(siteId, result);

  return result;
}

/**
 * Send a push notification summarizing pipeline results.
 * Only sends if there were meaningful actions (assets triaged or posts published).
 */
async function notifyPipelineResults(
  siteId: string,
  result: PipelineRunResult
): Promise<void> {
  const hasMeaningfulResults =
    result.assetsTriaged > 0 || result.postsPublished > 0;
  if (!hasMeaningfulResults) return;

  try {
    // Look up subscriber_id from the site
    const siteRows = await sql`
      SELECT subscriber_id, name as site_name
      FROM sites
      WHERE id = ${siteId}
    `;
    if (siteRows.length === 0) return;

    const { subscriber_id, site_name } = siteRows[0];
    const parts: string[] = [];

    if (result.assetsTriaged > 0) {
      parts.push(`${result.assetsTriaged} asset${result.assetsTriaged === 1 ? "" : "s"} triaged`);
    }
    if (result.postsPublished > 0) {
      parts.push(`${result.postsPublished} post${result.postsPublished === 1 ? "" : "s"} published`);
    }

    const title = `Pipeline Complete — ${site_name || "Your Site"}`;
    const body = parts.join(", ");

    await sendPushNotification(subscriber_id, title, body, {
      siteId,
      type: "pipeline_complete",
    });
  } catch (err) {
    // Non-fatal — don't break the pipeline for notification failures
    console.error("Failed to send pipeline notification:", err);
  }
}

/**
 * Run the pipeline for ALL sites with autopilot enabled.
 * Called by the global cron job.
 */
export async function runAllPipelines(): Promise<PipelineRunResult[]> {
  const sites = await sql`
    SELECT id FROM sites
    WHERE autopilot_enabled = true
      AND deleted_at IS NULL
      AND provisioning_status = 'complete'
  `;

  const results: PipelineRunResult[] = [];

  for (const site of sites) {
    const result = await runPipeline(site.id);
    results.push(result);
  }

  return results;
}
