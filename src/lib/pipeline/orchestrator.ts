import { sql } from "@/lib/db";
import { triageAsset } from "./triage";
import { generateSlots } from "./slot-generator";
import { fillSlots } from "./slot-filler";
import { generateMissingCaptions } from "./caption-generator";
import { publishDuePosts } from "./publisher";
import { generateMissingBlogPosts } from "./blog-generator";

export interface PipelineRunResult {
  siteId: string;
  assetsTriaged: number;
  slotsGenerated: number;
  slotsFilled: number;
  captionsGenerated: number;
  blogPostsGenerated: number;
  postsPublished: number;
  postsFailed: number;
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
    assetsTriaged: 0,
    slotsGenerated: 0,
    slotsFilled: 0,
    captionsGenerated: 0,
    blogPostsGenerated: 0,
    postsPublished: 0,
    postsFailed: 0,
    errors: [],
  };

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

  // Step 5: Generate blog posts from triaged assets (if blog enabled)
  try {
    result.blogPostsGenerated = await generateMissingBlogPosts(siteId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(`blog-gen: ${msg}`);
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

  return result;
}

/**
 * Run the pipeline for ALL sites with autopilot enabled.
 * Called by the global cron job.
 */
export async function runAllPipelines(): Promise<PipelineRunResult[]> {
  const sites = await sql`
    SELECT id FROM sites WHERE autopilot_enabled = true
  `;

  const results: PipelineRunResult[] = [];

  for (const site of sites) {
    const result = await runPipeline(site.id);
    results.push(result);
  }

  return results;
}
