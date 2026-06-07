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
 *
 * NOTE — Phase A retirement of brand_playbook (LOCKED 2026-06-07,
 * see [[brand-playbook-retirement]]):
 *
 * The brand_playbook SELECT on line ~44 is INTENTIONALLY LEFT BROKEN per
 * fail-aloud. Calls will throw 'column does not exist'. The reward-prompt
 * pipeline retires alongside Phase B [[brand-dna-retirement]] when
 * brand_descriptor.declared replaces brand_dna.playbook as the source.
 */

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "./types";

const anthropic = new Anthropic();

type SceneType = "humans" | "environment" | "product" | "method" | "region";

interface RewardPrompt {
  category: "moment" | "lifestyle" | "social_proof";
  scene: SceneType;
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
    FROM businesses WHERE id = ${siteId}
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

  const categories = ["moment", "lifestyle", "social_proof"] as const;
  const sceneTypes: SceneType[] = ["humans", "environment", "product", "method", "region"];

  const categoryInstructions: Record<string, string> = {
    moment: "THE MOMENT — the instant the customer's problem is solved or desire fulfilled. Peak emotional payoff.",
    lifestyle: "THE LIFESTYLE — the ongoing daily life that follows. The 'new normal' that's permanently better.",
    social_proof: "THE SOCIAL PROOF — others noticing, reacting, admiring. External validation of the investment.",
  };

  const sceneInstructions: Record<SceneType, string> = {
    humans: "HUMANS/ANIMALS — people (or pets) using, enjoying, or reacting. Show emotion, interaction, real life. Specify age range, attire, activity.",
    environment: "ENVIRONMENT ONLY — the space itself, no people. Mood, atmosphere, light, time of day. The space tells the story.",
    product: "PRODUCT-FOCUSED — close-up on a specific material, fixture, detail, or feature. Texture, craftsmanship, quality visible.",
    method: "METHOD-FOCUSED — the process, technique, or craftsmanship. How it's made, installed, or executed. Expertise visible.",
    region: "REGION-FOCUSED — local context, neighborhood, community, geography. The work in its local setting. City identity, climate, architecture.",
  };

  // Generate in batches: 3 categories × 5 scene types = 15 batches, ~7 prompts each ≈ 105 total
  for (const category of categories) {
    for (const scene of sceneTypes) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: `Generate 7 reward scene prompts for a ${businessType} called "${siteName}".

Brand angle: ${angle?.name || "professional service"} — ${angle?.tagline || ""}
Emotional core: ${offerCore}
Customer desires: ${desirePhrases.join("; ")}
Topics/features: ${topics.join(", ")}

Category: ${categoryInstructions[category]}
Scene type: ${sceneInstructions[scene]}

For each prompt generate:
- "prompt": 1-2 sentence scene from the customer's perspective. What they experience, not what the business does.
- "visual": Brief image/video description for AI generation (what the camera sees).

Be specific to THIS industry. Use customer language, not marketing jargon. Vary scenarios.

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
              scene,
              prompt: item.prompt,
              visual: item.visual,
            });
          }
        }
      } catch (err) {
        console.error(`Reward prompt generation failed for ${category}/${scene}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Store on the site
  if (allPrompts.length > 0) {
    await sql`
      UPDATE businesses
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
    SELECT metadata FROM businesses WHERE id = ${siteId}
  `;
  const metadata = (site?.metadata || {}) as Record<string, unknown>;
  return (metadata.reward_prompts as RewardPrompt[]) || [];
}

/**
 * Pick a random reward prompt, optionally filtered by category and/or scene type.
 */
export async function pickRewardPrompt(
  siteId: string,
  filters?: {
    category?: "moment" | "lifestyle" | "social_proof";
    scene?: SceneType;
  }
): Promise<RewardPrompt | null> {
  const prompts = await getRewardPrompts(siteId);
  if (prompts.length === 0) return null;

  let pool = prompts;
  if (filters?.category) {
    pool = pool.filter((p) => p.category === filters.category);
  }
  if (filters?.scene) {
    pool = pool.filter((p) => p.scene === filters.scene);
  }

  if (pool.length === 0) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}

export type { RewardPrompt, SceneType };
