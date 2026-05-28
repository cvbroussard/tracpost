import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

const anthropic = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";

/**
 * A single reward prompt — a persuasion angle the article generator
 * shapes around. Generated once per site from brand_dna; reused across
 * orchestrator ticks until regenerated.
 */
export interface RewardPrompt {
  /** Stable id for tracking which prompts get used + their performance. */
  id: string;
  /** Short human-readable label (3-6 words). */
  label: string;
  /**
   * Conversion this drives. Operator can later filter / weight by goal.
   * Free-form for v1; could become an enum if patterns settle.
   */
  goal: string;
  /** 1-2 sentence directive the LLM uses as `intent` on the ContentSpec. */
  intent: string;
  /** The persuasion angle / framing this prompt takes. */
  framingAngle: string;
  /**
   * Hint for asset selection — biases body assets toward proof shots,
   * process moments, people in frame, or before/after pairs.
   */
  assetBias?: "proof" | "process" | "people" | "before_after";
}

/**
 * Generate reward prompts for a site from its brand DNA.
 *
 * One Haiku call. Persists into sites.brand_dna.signals.reward_prompts
 * (extends the existing JSONB — no schema migration needed). Returns the
 * generated set.
 *
 * Once persisted, the v2 orchestrator's reward-prompt strategy picks
 * one per tick and uses it as the article's intent + asset bias.
 */
export async function generateRewardPrompts(siteId: string): Promise<RewardPrompt[]> {
  const [site] = await sql`
    SELECT name, url, brand_dna
    FROM businesses
    WHERE id = ${siteId}
  `;
  if (!site) throw new Error(`Site ${siteId} not found`);

  const dna = (site.brand_dna || {}) as Record<string, unknown>;
  const playbook = (dna.playbook as BrandPlaybook | null) || null;
  if (!playbook) {
    throw new Error(`Site ${siteId} has no brand_dna.playbook — generate Brand DNA first`);
  }

  const prompt = buildPrompt({
    siteName: String(site.name || ""),
    siteUrl: String(site.url || ""),
    playbook,
  });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";

  const prompts = parsePrompts(text);
  if (prompts.length === 0) {
    throw new Error("LLM returned no parseable reward prompts");
  }

  // Persist into dna.signals.reward_prompts (JSONB merge, additive)
  const updatedDna = {
    ...dna,
    signals: {
      ...((dna.signals as Record<string, unknown>) || {}),
      reward_prompts: prompts,
      reward_prompts_generated_at: new Date().toISOString(),
    },
  };
  await sql`
    UPDATE businesses
    SET brand_dna = ${JSON.stringify(updatedDna)}::jsonb
    WHERE id = ${siteId}
  `;

  return prompts;
}

function buildPrompt(opts: {
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook;
}): string {
  const { siteName, siteUrl, playbook } = opts;
  const angle = playbook.brandPositioning?.selectedAngles?.[0];
  const lang = playbook.audienceResearch?.languageMap;
  const offer = playbook.offerCore;

  const parts: string[] = [];
  parts.push("You are a senior content strategist at a marketing agency. Your job: produce a portfolio of REWARD PROMPTS — strategic persuasion angles that shape future articles toward specific business outcomes (bookings, leads, awareness, trust-building, seasonal urgency).");
  parts.push("");
  parts.push("Each prompt is reusable: the generator picks one per article and shapes the article's intent + frame around it. Your job is to give the orchestrator real strategic options, not generic advice.");
  parts.push("");
  parts.push("## The business");
  parts.push(`Site: ${siteName} (${siteUrl})`);
  if (angle) {
    parts.push(`Brand angle: "${angle.name}" — ${angle.tagline || ""}`);
    parts.push(`Tone: ${angle.tone || "engaging"}`);
  }
  if (offer?.offerStatement?.emotionalCore) {
    parts.push(`Emotional core: ${offer.offerStatement.emotionalCore}`);
  }
  if (lang) {
    if (lang.painPhrases?.length) parts.push(`Customer pain phrases: ${lang.painPhrases.join(" | ")}`);
    if (lang.desirePhrases?.length) parts.push(`Customer desire phrases: ${lang.desirePhrases.join(" | ")}`);
  }

  parts.push("");
  parts.push("## What to produce");
  parts.push("Generate 8-12 reward prompts. Each must be SPECIFIC to this business — generic prompts (e.g. 'showcase your work', 'build trust') are useless. Each prompt should sound like advice a skilled content strategist would give this specific brand.");
  parts.push("");
  parts.push("Spread them across these conversion goals:");
  parts.push("  - bookings: drive consultation/discovery calls");
  parts.push("  - leads: capture qualified inquiries");
  parts.push("  - awareness: top-of-funnel positioning");
  parts.push("  - trust: credibility through proof + transparency");
  parts.push("  - urgency: seasonal / time-sensitive triggers");
  parts.push("");
  parts.push("And assetBias — what kind of visuals best serve each prompt:");
  parts.push("  - proof: completed work, finished outcomes, finished spaces");
  parts.push("  - process: decisions, materials, in-flight craft");
  parts.push("  - people: faces, hands, the team or client");
  parts.push("  - before_after: transformation pairs");
  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON array, no markdown fencing:");
  parts.push("```");
  parts.push(`[
  {
    "label": "<3-6 words>",
    "goal": "bookings|leads|awareness|trust|urgency",
    "intent": "<1-2 sentence directive the article generator follows>",
    "framingAngle": "<the persuasion angle in plain language>",
    "assetBias": "proof|process|people|before_after"
  },
  ...
]`);
  parts.push("```");
  parts.push("");
  parts.push("Rules:");
  parts.push("- Use the customer's actual pain/desire phrases in your framing where possible");
  parts.push("- Each prompt is REUSABLE — the article generator will pick one and write a fresh article around it; the prompt should leave room for varied execution");
  parts.push("- Don't repeat the same goal more than 3 times across the set");

  return parts.join("\n");
}

function parsePrompts(text: string): RewardPrompt[] {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object" && p.label && p.intent)
      .map((p, i) => ({
        id: `rp_${Date.now()}_${i}`,
        label: String(p.label),
        goal: String(p.goal || "awareness"),
        intent: String(p.intent),
        framingAngle: String(p.framingAngle || ""),
        assetBias: ["proof", "process", "people", "before_after"].includes(p.assetBias)
          ? p.assetBias
          : undefined,
      }));
  } catch {
    return [];
  }
}
