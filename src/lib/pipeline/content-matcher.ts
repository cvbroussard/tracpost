/**
 * Content Matcher — pairs reward prompts with assets
 *
 * The reward prompt is the seed (editorial intent).
 * The asset serves the story (visual evidence).
 * Vision analysis is the matching key.
 *
 * Dedup: tracks prompt+asset pairings to avoid repetition.
 * Assets with lower used_count get priority. When exhausted,
 * re-uses least-recently-used assets with different prompts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { pickRewardPrompt, type RewardPrompt, type SceneType } from "@/lib/brand-intelligence/reward-prompts";

const anthropic = new Anthropic();

export interface ContentPairing {
  rewardPrompt: RewardPrompt;
  asset: {
    id: string;
    storageUrl: string;
    contextNote: string;
    description: string;
    qualityScore: number;
    contentPillar: string;
    contentTags: string[];
    vendors: Array<{ name: string; url: string | null }>;
  };
}

/**
 * Pick the next content pairing for the autopilot.
 *
 * 1. Pick a reward prompt (rotating through categories and scene types)
 * 2. Find the best matching asset from the reservoir
 * 3. Return the pairing for content generation
 */
export async function pickNextContent(
  siteId: string
): Promise<ContentPairing | null> {
  // Determine which category/scene to use next for variety
  const nextSlot = await getNextSlot(siteId);

  // Pick a reward prompt matching the slot
  const prompt = await pickRewardPrompt(siteId, nextSlot);
  if (!prompt) return null;

  // Find the best matching asset
  const asset = await findMatchingAsset(siteId, prompt);
  if (!asset) return null;

  return { rewardPrompt: prompt, asset };
}

/**
 * Determine the next category/scene slot to fill.
 * Rotates through scene types evenly based on recent content history.
 */
async function getNextSlot(
  siteId: string
): Promise<{ category?: "moment" | "lifestyle" | "social_proof"; scene?: SceneType } | undefined> {
  // Check what scene types have been used recently
  const recent = await sql`
    SELECT metadata->>'scene_type' AS scene
    FROM blog_posts
    WHERE site_id = ${siteId}
      AND created_at > NOW() - INTERVAL '14 days'
      AND metadata->>'scene_type' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const recentScenes = recent.map((r) => r.scene as string).filter(Boolean);
  const allScenes: SceneType[] = ["humans", "environment", "product", "method", "region"];

  // Find the least-used scene type in recent history
  const sceneCounts = new Map<string, number>();
  for (const s of allScenes) sceneCounts.set(s, 0);
  for (const s of recentScenes) sceneCounts.set(s, (sceneCounts.get(s) || 0) + 1);

  let leastUsedScene: SceneType = "humans";
  let leastCount = Infinity;
  for (const [scene, count] of sceneCounts) {
    if (count < leastCount) {
      leastCount = count;
      leastUsedScene = scene as SceneType;
    }
  }

  // Rotate categories evenly too
  const recentCategories = await sql`
    SELECT metadata->>'reward_category' AS cat
    FROM blog_posts
    WHERE site_id = ${siteId}
      AND created_at > NOW() - INTERVAL '7 days'
      AND metadata->>'reward_category' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const catCounts = { moment: 0, lifestyle: 0, social_proof: 0 };
  for (const r of recentCategories) {
    const cat = r.cat as keyof typeof catCounts;
    if (cat in catCounts) catCounts[cat]++;
  }

  let leastUsedCat: "moment" | "lifestyle" | "social_proof" = "moment";
  let leastCatCount = Infinity;
  for (const [cat, count] of Object.entries(catCounts)) {
    if (count < leastCatCount) {
      leastCatCount = count;
      leastUsedCat = cat as typeof leastUsedCat;
    }
  }

  return { category: leastUsedCat, scene: leastUsedScene };
}

/**
 * Find the best asset from the reservoir to match a reward prompt.
 *
 * Matching logic:
 * 1. Ask Haiku which assets best fit the reward prompt's visual description
 * 2. Prioritize: highest quality, lowest used_count, has vendors
 * 3. Exclude assets already paired with this exact prompt
 */
async function findMatchingAsset(
  siteId: string,
  prompt: RewardPrompt
): Promise<ContentPairing["asset"] | null> {
  // Get candidate assets — triaged, decent quality, not over-used, no existing post
  // Prefer assets matching the reward prompt's scene type
  const candidates = await sql`
    SELECT ma.id, ma.storage_url, ma.context_note, ma.quality_score,
           ma.content_pillar, ma.content_tags, ma.ai_analysis,
           COALESCE((ma.metadata->>'used_count')::int, 0) AS used_count,
           ma.metadata->>'last_used_at' AS last_used_at
    FROM media_assets ma
    LEFT JOIN blog_posts bp ON bp.source_asset_id = ma.id
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status IN ('triaged', 'scheduled')
      AND ma.quality_score >= 0.5
      AND bp.id IS NULL
    ORDER BY
      CASE WHEN ma.ai_analysis->>'scene_type' = ${prompt.scene} THEN 0 ELSE 1 END,
      COALESCE((ma.metadata->>'used_count')::int, 0) ASC,
      ma.quality_score DESC
    LIMIT 20
  `;

  if (candidates.length === 0) return null;

  // For small sets, just pick the best scene-matched, least-used asset
  if (candidates.length <= 5) {
    return buildAssetResult(candidates[0], siteId);
  }

  // For larger sets, ask Haiku to pick the best match
  const assetDescriptions = candidates.slice(0, 10).map((a, i) => {
    const analysis = (a.ai_analysis as Record<string, unknown>) || {};
    return `${i + 1}. [${a.id}] Quality: ${a.quality_score} | ${analysis.description || a.context_note || "No description"} | Tags: ${(a.content_tags || []).join(", ")}`;
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{
        role: "user",
        content: `Which asset best illustrates this scene?

Scene: "${prompt.prompt}"
Visual: "${prompt.visual}"

Assets:
${assetDescriptions.join("\n")}

Return ONLY the asset number (1-${assetDescriptions.length}):`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const num = parseInt(text.replace(/\D/g, ""), 10);
    const index = (num >= 1 && num <= candidates.length) ? num - 1 : 0;

    return buildAssetResult(candidates[index], siteId);
  } catch {
    // Fallback to first candidate (least used, highest quality)
    return buildAssetResult(candidates[0], siteId);
  }
}

/**
 * Build the asset result with vendor info.
 */
async function buildAssetResult(
  asset: Record<string, unknown>,
  siteId: string
): Promise<ContentPairing["asset"]> {
  const assetId = asset.id as string;

  // Fetch associated vendors
  const vendors = await sql`
    SELECT v.name, v.url FROM asset_vendors av
    JOIN vendors v ON v.id = av.vendor_id
    WHERE av.asset_id = ${assetId}
  `;

  // Increment used_count
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      used_count: ((asset.metadata as Record<string, unknown>)?.used_count as number || 0) + 1,
      last_used_at: new Date().toISOString(),
    })}::jsonb
    WHERE id = ${assetId}
  `;

  const analysis = (asset.ai_analysis as Record<string, unknown>) || {};

  return {
    id: assetId,
    storageUrl: asset.storage_url as string,
    contextNote: (asset.context_note as string) || "",
    description: (analysis.description as string) || "",
    qualityScore: Number(asset.quality_score) || 0,
    contentPillar: (asset.content_pillar as string) || "",
    contentTags: (asset.content_tags as string[]) || [],
    vendors: vendors.map((v) => ({ name: v.name as string, url: v.url as string | null })),
  };
}

/**
 * Record that a reward prompt + asset pairing was used for content.
 * Stores in blog_posts metadata for dedup tracking.
 */
export function buildContentMetadata(
  prompt: RewardPrompt,
  assetId: string
): Record<string, unknown> {
  return {
    reward_prompt: prompt.prompt,
    reward_category: prompt.category,
    scene_type: prompt.scene,
    seed_asset_id: assetId,
    generated_at: new Date().toISOString(),
  };
}
