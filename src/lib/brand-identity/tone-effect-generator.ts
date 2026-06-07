/**
 * tone_effect_recommendation substrate generator.
 *
 * Per [[verbal-domain-decomposition]] LOCKED 2026-06-03: tone.effect is the
 * LLM-synthesized half of the tone descriptor — "how should the audience FEEL
 * after exposure to this brand's voice?" Owner reviews + approves the chosen
 * suggestion at the synthesis-review stage. The accepted prose IS the declared
 * tone.effect value.
 *
 * Inputs (per the verbal-decomp memo's synthesis table):
 *   tone.attributes + tone.example + voice_source.source + audience profile
 *   + positioning + GBP categories
 *
 * Output: 3 suggestions, each one a 1-2 sentence answer to the audience-effect
 * question, with reasoning and confidence. Owner picks one, optionally refines
 * the prose, commits to declared.
 *
 * Model: Haiku 4.5. Cheap (~$0.005/run), fast, text-only.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { createHash } from "crypto";
import { upsertSubstrate, getSubstrate } from "@/lib/substrate/store";

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "tone_effect_recommendation_v1";
const SUGGESTION_COUNT = 3;

const anthropic = new Anthropic();

export interface ToneEffectSuggestion {
  /** "suggestion_a" | "suggestion_b" | "suggestion_c". */
  id: string;
  /** 1-2 sentences answering "how should the audience FEEL?" */
  prose: string;
  /** Why this effect follows from the brand's voice + audience context. */
  reasoning: string;
  /** Self-reported confidence 0..1 — how strongly the brand's context supports this effect. */
  confidence: number;
}

export interface ToneEffectRecommendationPayload {
  suggestions: ToneEffectSuggestion[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
  };
}

interface BrandContextInputs {
  businessName: string | null;
  gbpCategories: string[];
  voiceSource: string | null;
  toneAttributes: string[];
  toneExample: string | null;
  positioningAngles: string[];
  audienceWho: string | null;
  audiencePains: string[];
  audienceTriggers: string[];
}

async function readBrandContext(businessId: string): Promise<BrandContextInputs> {
  const [biz] = await sql`
    SELECT name FROM businesses WHERE id = ${businessId} LIMIT 1
  `;

  const catRows = await sql`
    SELECT gc.name
    FROM business_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${businessId}
    ORDER BY sgc.is_primary DESC, gc.name ASC
  `;

  const [identity] = await sql`
    SELECT id FROM brand_identity WHERE business_id = ${businessId} AND is_primary = true LIMIT 1
  `;

  let voiceSource: string | null = null;
  let toneAttributes: string[] = [];
  let toneExample: string | null = null;
  const positioningAngles: string[] = [];
  let audienceWho: string | null = null;
  let audiencePains: string[] = [];
  let audienceTriggers: string[] = [];

  if (identity?.id) {
    const rows = await sql`
      SELECT key, declared
      FROM brand_descriptor
      WHERE brand_identity_id = ${identity.id}
        AND key IN ('voice_source', 'tone', 'positioning', 'audience')
    `;
    for (const r of rows) {
      const declared = r.declared as unknown;
      if (r.key === "voice_source") {
        if (typeof declared === "string") voiceSource = declared;
        else if (declared && typeof declared === "object") {
          const obj = declared as Record<string, unknown>;
          voiceSource = typeof obj.source === "string" ? obj.source : null;
        }
      } else if (r.key === "tone" && typeof declared === "object" && declared) {
        const obj = declared as Record<string, unknown>;
        if (Array.isArray(obj.attributes)) {
          toneAttributes = (obj.attributes as unknown[]).filter(
            (s): s is string => typeof s === "string",
          );
        }
        if (typeof obj.example === "string") toneExample = obj.example;
      } else if (r.key === "positioning" && typeof declared === "object" && declared) {
        const obj = declared as Record<string, unknown>;
        const angles = obj.angles;
        if (angles && typeof angles === "object" && !Array.isArray(angles)) {
          const anglesObj = angles as { angles?: unknown[] };
          const angleArr = Array.isArray(anglesObj.angles) ? anglesObj.angles : [];
          for (const a of angleArr) {
            if (a && typeof a === "object" && !Array.isArray(a)) {
              const angle = a as Record<string, unknown>;
              const wedge = angle.wedge as Record<string, unknown> | undefined;
              const stance = wedge?.what_we_do;
              if (typeof stance === "string" && stance.trim().length > 0) {
                positioningAngles.push(stance.trim());
              }
            }
          }
        }
      } else if (r.key === "audience" && typeof declared === "object" && declared) {
        const obj = declared as Record<string, unknown>;
        if (typeof obj.who === "string") audienceWho = obj.who;
        if (Array.isArray(obj.pains)) {
          audiencePains = (obj.pains as unknown[]).filter(
            (s): s is string => typeof s === "string" && s.trim().length > 0,
          );
        }
        if (Array.isArray(obj.triggers)) {
          audienceTriggers = (obj.triggers as unknown[]).filter(
            (s): s is string => typeof s === "string" && s.trim().length > 0,
          );
        }
      }
    }
  }

  return {
    businessName: (biz?.name as string | null) ?? null,
    gbpCategories: catRows.map((r) => r.name as string),
    voiceSource,
    toneAttributes,
    toneExample,
    positioningAngles,
    audienceWho,
    audiencePains,
    audienceTriggers,
  };
}

function hashInputs(ctx: BrandContextInputs): string {
  const stable = JSON.stringify({
    name: ctx.businessName,
    cats: [...ctx.gbpCategories].sort(),
    voice: ctx.voiceSource,
    attrs: [...ctx.toneAttributes].sort(),
    example: ctx.toneExample,
    pos: [...ctx.positioningAngles].sort(),
    aud: ctx.audienceWho,
    pains: [...ctx.audiencePains].sort(),
    triggers: [...ctx.audienceTriggers].sort(),
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function buildSystemPrompt(): string {
  return `You are a brand voice strategist proposing the AUDIENCE EFFECT half of a brand's tone descriptor. Each suggestion answers: "How should the audience FEEL after one exposure to this brand's voice?"

WHAT TONE.EFFECT IS:
- A 1-2 sentence statement of the feeling the audience should walk away with.
- It compresses tone attributes + audience pains/triggers into an emotional outcome.
- Examples (NOT for direct reuse — illustrative):
    · "Reassured that complexity won't be brushed off — and that someone is paying attention to the details others would skip."
    · "Equipped — not sold to. The reader feels they've gained real working knowledge they could act on without us."
    · "Calmed. The reader's anxious mental loops about [pain] quiet down because the brand demonstrates control."

DISCIPLINE:
- Each suggestion must be DIFFERENT — span different emotional registers (e.g. one reassuring, one empowering, one quietly authoritative). Not 3 phrasings of the same feeling.
- Each suggestion must DERIVE FROM the brand's specific context — audience pain + tone attributes + voice source. Generic effects ("they feel like they're in good hands") are noise.
- HONOR the tone example (4-sentence brand copy paste). The example is the strongest signal of the brand's actual voice register; the proposed effect must be plausibly produced by that voice.
- The suggestion is the AUDIENCE FEELING, not the brand's marketing claim. "We make customers feel respected" is wrong shape. "Respected — as a person who already knows their problem and just needs the right partner to execute" is the right shape.

REASONING FIELD:
- 1-2 sentences explaining HOW the brand's context produces this feeling. Reference specific tone attributes, the audience pain, or the voice source.

CONFIDENCE FIELD:
- 0..1 self-reported. Low (≤0.5) when inputs are thin (no tone.example, no audience.pains) — flag the gap in reasoning. Medium (0.6-0.8) when inputs are present but mixed signal. High (>0.8) when the brand context strongly converges on this effect.

OUTPUT: single valid JSON object: { "suggestions": [{ "id": "suggestion_a", "prose": "...", "reasoning": "...", "confidence": 0.0-1.0 }, ...] }. Exactly ${SUGGESTION_COUNT} entries. IDs: suggestion_a, suggestion_b, suggestion_c. No prose, no markdown fences.`;
}

function buildUserText(ctx: BrandContextInputs): string {
  const lines: string[] = [];
  lines.push("BRAND CONTEXT");
  if (ctx.businessName) lines.push(`- Business: ${ctx.businessName}`);
  if (ctx.gbpCategories.length > 0) {
    lines.push(`- GBP categories: ${ctx.gbpCategories.join(", ")}`);
  }

  if (ctx.voiceSource) lines.push(`- Voice source: ${ctx.voiceSource}`);
  if (ctx.toneAttributes.length > 0) {
    lines.push(`- Tone attributes: ${ctx.toneAttributes.join(", ")}`);
  } else {
    lines.push("- Tone attributes: (none declared — confidence will be lower)");
  }
  if (ctx.toneExample) {
    lines.push(`- Brand's actual voice (4-sentence example):`);
    lines.push(`    "${ctx.toneExample.replace(/\n/g, " ")}"`);
  } else {
    lines.push("- Tone example: (none provided — confidence will be lower)");
  }

  if (ctx.positioningAngles.length > 0) {
    lines.push(`- Positioning angles:`);
    for (const a of ctx.positioningAngles) lines.push(`    · ${a}`);
  }

  if (ctx.audienceWho) lines.push(`- Audience: ${ctx.audienceWho}`);
  if (ctx.audiencePains.length > 0) {
    lines.push(`- Audience pains: ${ctx.audiencePains.join(" | ")}`);
  }
  if (ctx.audienceTriggers.length > 0) {
    lines.push(`- Audience triggers: ${ctx.audienceTriggers.join(" | ")}`);
  }

  lines.push("");
  lines.push(`Propose ${SUGGESTION_COUNT} distinct audience-effect suggestions per the discipline rules above.`);
  lines.push(`Return JSON: { "suggestions": [{ "id": "suggestion_a", "prose": "...", "reasoning": "...", "confidence": 0.0-1.0 }, ...] }.`);
  return lines.join("\n");
}

export async function generateToneEffectRecommendation(args: {
  businessId: string;
}): Promise<{ persisted: boolean; substrateId?: string; reason?: string }> {
  const { businessId } = args;

  const ctx = await readBrandContext(businessId);
  const inputs_hash = hashInputs(ctx);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserText(ctx) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let parsed: { suggestions?: ToneEffectSuggestion[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      persisted: false,
      reason: `model returned non-JSON output (model=${MODEL}); raw text length=${text.length}`,
    };
  }
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  if (suggestions.length === 0) {
    return { persisted: false, reason: "model returned no suggestions" };
  }

  const generated_at = new Date().toISOString();
  const payload: ToneEffectRecommendationPayload = {
    suggestions,
    meta: { inputs_hash, generated_at, model: MODEL, prompt_version: PROMPT_VERSION },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "tone_effect_recommendation",
    payload: payload as unknown as Record<string, unknown>,
    generationMetadata: {
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      generated_at,
      inputs_hash,
      inputs: {
        business_name: ctx.businessName,
        gbp_categories: ctx.gbpCategories,
        voice_source: ctx.voiceSource,
        tone_attributes: ctx.toneAttributes,
        has_tone_example: ctx.toneExample !== null,
        positioning_angles_count: ctx.positioningAngles.length,
        has_audience: ctx.audienceWho !== null,
      },
    },
  });

  return { persisted: true, substrateId };
}

export async function readToneEffectRecommendation(
  businessId: string,
): Promise<ToneEffectRecommendationPayload | null> {
  const row = await getSubstrate<ToneEffectRecommendationPayload>(
    businessId,
    "tone_effect_recommendation",
  );
  return row?.payload ?? null;
}
