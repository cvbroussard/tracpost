/**
 * Reward Prompt Library Generator
 *
 * Auto-generates 100 aspirational "reward scene" prompts from the
 * subscriber's playbook. These prompts drive the autopilot content
 * engine — each one describes a lifestyle outcome that motivates
 * the subscriber's target audience.
 *
 * Three categories:
 * 1. The Moment — the customer's problem is solved
 * 2. The Lifestyle — the daily life that follows
 * 3. The Social Proof — others noticing, reacting, admiring
 *
 * Generated once during playbook sharpening, stored on the site.
 * The system draws from them indefinitely to produce blog articles,
 * social posts, editorial images, and video content.
 */

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "./types";

const anthropic = new Anthropic();

interface RewardPrompt {
  category: "moment" | "lifestyle" | "social_proof";
  prompt: string;
  visual: string;
}

/**
 * Generate the reward prompt library from a sharpened playbook.
 * Produces ~100 prompts across three categories.
 * Stores them on the sites table as reward_prompts JSONB.
 */
export async function generateRewardPrompts(
  siteId: string
): Promise<RewardPrompt[]> {
  // Fetch playbook and site context
  const [site] = await sql`
    SELECT name, brand_playbook, brand_voice, business_type, pillar_config
    FROM sites WHERE id = ${siteId}
  `;

  if (!site?.brand_playbook) {
    console.warn("No playbook — cannot generate reward prompts");
    return [];
  }

  const playbook = site.brand_playbook as unknown as BrandPlaybook;
  const businessType = (site.business_type as string) || "business";
  const siteName = (site.name as string) || "";

  // Extract key playbook data
  const angle = playbook.brandPositioning?.selectedAngles?.[0];
  const lang = playbook.audienceResearch?.languageMap;
  const painPhrases = lang?.painPhrases?.slice(0, 5) || [];
  const desirePhrases = lang?.desirePhrases?.slice(0, 5) || [];
  const offerCore = playbook.offerCore?.offerStatement?.emotionalCore || "";

  // Extract pillar labels for topic variety
  const pillarConfig = (site.pillar_config || []) as Array<{
    id: string; label: string; tags: Array<{ label: string }>;
  }>;
  const topics = pillarConfig.flatMap((p) =>
    p.tags.map((t) => t.label)
  ).slice(0, 15);

  const allPrompts: RewardPrompt[] = [];

  // Generate in 3 batches — one per category
  for (const category of ["moment", "lifestyle", "social_proof"] as const) {
    const categoryInstructions: Record<string, string> = {
      moment: `THE MOMENT — the instant the customer's problem is solved or their desire is fulfilled.
Examples: first dinner party in the new kitchen, dog walking calmly for the first time, business opening day, unwrapping the perfect gift.
These are peak emotional payoff scenes. The customer realizes it was worth it.`,

      lifestyle: `THE LIFESTYLE — the ongoing daily life that follows.
Examples: morning coffee ritual in the new space, confident walks with a trained dog, repeat customers at the new restaurant, living room transformed by a statement piece.
These are "new normal" scenes. The customer's daily experience has permanently improved.`,

      social_proof: `THE SOCIAL PROOF — others noticing, reacting, admiring.
Examples: dinner guests asking about the countertop, neighbors commenting on the renovation, Instagram-worthy moments, friends wanting the same thing.
These are validation scenes. The customer's investment earns external recognition.`,
    };

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `Generate 33 reward scene prompts for a ${businessType} called "${siteName}".

Brand angle: ${angle?.name || "professional service"} — ${angle?.tagline || ""}
Emotional core: ${offerCore}
Customer desires: ${desirePhrases.join("; ")}
Customer pain points: ${painPhrases.join("; ")}
Topics/features: ${topics.join(", ")}

Category: ${categoryInstructions[category]}

For each prompt generate:
- "prompt": A 1-2 sentence scene description that could be used as a blog article angle, social post theme, or image/video generation prompt. Written from the customer's perspective — what they experience, not what the business does.
- "visual": A brief image/video description for AI generation (what the camera sees).

Make them specific to THIS industry and THIS brand. Use the customer's language, not marketing jargon. Vary the scenarios — different times of day, different people, different aspects of the service/product.

Return ONLY a JSON array, no markdown:
[{"prompt": "...", "visual": "..."}, ...]`,
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ prompt: string; visual: string }>;
        for (const item of parsed) {
          allPrompts.push({
            category,
            prompt: item.prompt,
            visual: item.visual,
          });
        }
      }
    } catch (err) {
      console.error(`Reward prompt generation failed for ${category}:`, err instanceof Error ? err.message : err);
    }
  }

  // Store on the site
  if (allPrompts.length > 0) {
    await sql`
      UPDATE sites
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ reward_prompts: allPrompts })}::jsonb
      WHERE id = ${siteId}
    `;
  }

  return allPrompts;
}

/**
 * Get the reward prompt library for a site.
 * Returns from stored metadata if available.
 */
export async function getRewardPrompts(siteId: string): Promise<RewardPrompt[]> {
  const [site] = await sql`
    SELECT metadata FROM sites WHERE id = ${siteId}
  `;
  const metadata = (site?.metadata || {}) as Record<string, unknown>;
  return (metadata.reward_prompts as RewardPrompt[]) || [];
}

/**
 * Pick a random reward prompt that hasn't been used recently.
 * Tracks usage in site metadata to avoid repetition.
 */
export async function pickRewardPrompt(
  siteId: string,
  category?: "moment" | "lifestyle" | "social_proof"
): Promise<RewardPrompt | null> {
  const prompts = await getRewardPrompts(siteId);
  if (prompts.length === 0) return null;

  // Filter by category if specified
  const pool = category
    ? prompts.filter((p) => p.category === category)
    : prompts;

  if (pool.length === 0) return null;

  // Pick random from pool
  return pool[Math.floor(Math.random() * pool.length)];
}
