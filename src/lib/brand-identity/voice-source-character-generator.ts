/**
 * voice_source_character_recommendation substrate generator.
 *
 * Per [[verbal-domain-decomposition]] LOCKED 2026-06-03: voice_source.character
 * is the LLM-synthesized half of the voice_source descriptor — a character
 * profile of WHO speaks for the brand. Distinct from voice_source.source
 * (which picks the speaker CLASS: Founder/Team/Brand persona/...). The
 * character is a 2-4 sentence portrait of the speaker's personality, attitude,
 * professional posture, and how they relate to the audience.
 *
 * Inputs (per the verbal-decomp memo's synthesis table):
 *   voice_source.source + tone.attributes + audience profile + GBP categories
 *
 * Output: 3 suggestions. Each one a 2-4 sentence character portrait. Owner
 * picks one, optionally refines, commits to declared.
 *
 * Model: Haiku 4.5.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { createHash } from "crypto";
import { upsertSubstrate, getSubstrate } from "@/lib/substrate/store";

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "voice_source_character_recommendation_v1";
const SUGGESTION_COUNT = 3;

const anthropic = new Anthropic();

export interface VoiceSourceCharacterSuggestion {
  id: string;
  prose: string;
  reasoning: string;
  confidence: number;
}

export interface VoiceSourceCharacterRecommendationPayload {
  suggestions: VoiceSourceCharacterSuggestion[];
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
  audienceWho: string | null;
  audiencePains: string[];
  positioningAngles: string[];
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
  let audienceWho: string | null = null;
  let audiencePains: string[] = [];
  const positioningAngles: string[] = [];

  if (identity?.id) {
    const rows = await sql`
      SELECT key, declared
      FROM brand_descriptor
      WHERE brand_identity_id = ${identity.id}
        AND key IN ('voice_source', 'tone', 'audience', 'positioning')
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
      } else if (r.key === "audience" && typeof declared === "object" && declared) {
        const obj = declared as Record<string, unknown>;
        if (typeof obj.who === "string") audienceWho = obj.who;
        if (Array.isArray(obj.pains)) {
          audiencePains = (obj.pains as unknown[]).filter(
            (s): s is string => typeof s === "string" && s.trim().length > 0,
          );
        }
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
      }
    }
  }

  return {
    businessName: (biz?.name as string | null) ?? null,
    gbpCategories: catRows.map((r) => r.name as string),
    voiceSource,
    toneAttributes,
    toneExample,
    audienceWho,
    audiencePains,
    positioningAngles,
  };
}

function hashInputs(ctx: BrandContextInputs): string {
  const stable = JSON.stringify({
    name: ctx.businessName,
    cats: [...ctx.gbpCategories].sort(),
    voice: ctx.voiceSource,
    attrs: [...ctx.toneAttributes].sort(),
    example: ctx.toneExample,
    aud: ctx.audienceWho,
    pains: [...ctx.audiencePains].sort(),
    pos: [...ctx.positioningAngles].sort(),
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function buildSystemPrompt(): string {
  return `You are a brand voice strategist proposing the CHARACTER half of a brand's voice_source descriptor. Each suggestion is a 2-4 sentence portrait of WHO speaks for the brand.

WHAT VOICE_SOURCE.CHARACTER IS:
- A 2-4 sentence portrait of the speaker's personality, professional posture, attitude toward the audience, and what they sound like.
- Distinct from voice_source.source (which picks the speaker CLASS: Founder / Team / Named individuals / Brand persona / Operator role). The character fills in the personality details that the class label leaves abstract.
- Examples (NOT for direct reuse — illustrative; assume voice_source.source = "Team" for both):
    · "A field-tested construction team that has worked through enough botched scopes to recognize them on sight. Direct without bluster, patient with confused homeowners, intolerant of contractor stereotypes. The kind of crew that explains the framing before it gets covered up — because they expect to be back in five years and want the work to age well."
    · "A two-person founder team — one runs the field, one runs the books. They sound like the same person across calls and texts: warm, specific, allergic to filler. Not the polished agency contractor; not the gruff old-school one either. The pair who quietly fixes the problem your previous contractor introduced."

DISCIPLINE:
- The character must be GROUNDED in voice_source.source (which class of speaker) AND tone.attributes (which adjectives) AND tone.example (the actual brand copy). A "team" character is different from a "founder" character; a "warm + collaborative" team is different from a "direct + technical" team.
- Three suggestions must occupy DIFFERENT character cuts within the same class — not three rephrasings of one character. Cuts: weathered-pragmatic / quietly-authoritative / warmly-collaborative / restless-craftsperson / etc.
- HONOR the tone example — if the brand copy is plain and direct, don't propose a flowery character. If it's analytic, don't propose an emotional one.
- Reference the audience's posture in the character — the speaker's stance TOWARD the audience matters as much as the speaker's identity.
- Avoid contractor / agency / SaaS stereotypes ("we're a passionate team of..."). The character should be specific enough that a different brand in the same industry couldn't reuse it.

REASONING FIELD:
- 1-2 sentences explaining HOW the brand's context produces this character. Reference tone attributes, the source class, audience pains, or the tone example.

CONFIDENCE FIELD:
- 0..1 self-reported. Low (≤0.5) when inputs are thin (no tone.example, no audience). Medium (0.6-0.8) when inputs are present but mixed signal. High (>0.8) when context strongly converges.

OUTPUT: single valid JSON object: { "suggestions": [{ "id": "suggestion_a", "prose": "...", "reasoning": "...", "confidence": 0.0-1.0 }, ...] }. Exactly ${SUGGESTION_COUNT} entries. IDs: suggestion_a, suggestion_b, suggestion_c. No prose, no markdown fences.`;
}

function buildUserText(ctx: BrandContextInputs): string {
  const lines: string[] = [];
  lines.push("BRAND CONTEXT");
  if (ctx.businessName) lines.push(`- Business: ${ctx.businessName}`);
  if (ctx.gbpCategories.length > 0) {
    lines.push(`- GBP categories: ${ctx.gbpCategories.join(", ")}`);
  }

  if (ctx.voiceSource) {
    lines.push(`- Voice source CLASS: ${ctx.voiceSource}`);
  } else {
    lines.push("- Voice source: (none declared — confidence will be very low; pick a source first)");
  }
  if (ctx.toneAttributes.length > 0) {
    lines.push(`- Tone attributes: ${ctx.toneAttributes.join(", ")}`);
  }
  if (ctx.toneExample) {
    lines.push(`- Brand's actual voice (4-sentence example):`);
    lines.push(`    "${ctx.toneExample.replace(/\n/g, " ")}"`);
  }

  if (ctx.audienceWho) lines.push(`- Audience: ${ctx.audienceWho}`);
  if (ctx.audiencePains.length > 0) {
    lines.push(`- Audience pains: ${ctx.audiencePains.join(" | ")}`);
  }

  if (ctx.positioningAngles.length > 0) {
    lines.push(`- Positioning angles:`);
    for (const a of ctx.positioningAngles) lines.push(`    · ${a}`);
  }

  lines.push("");
  lines.push(`Propose ${SUGGESTION_COUNT} distinct CHARACTER suggestions for this brand's voice. Each 2-4 sentences. Different cuts within the same source class.`);
  lines.push(`Return JSON: { "suggestions": [{ "id": "suggestion_a", "prose": "...", "reasoning": "...", "confidence": 0.0-1.0 }, ...] }.`);
  return lines.join("\n");
}

export async function generateVoiceSourceCharacterRecommendation(args: {
  businessId: string;
}): Promise<{ persisted: boolean; substrateId?: string; reason?: string }> {
  const { businessId } = args;

  const ctx = await readBrandContext(businessId);
  const inputs_hash = hashInputs(ctx);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserText(ctx) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let parsed: { suggestions?: VoiceSourceCharacterSuggestion[] };
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
  const payload: VoiceSourceCharacterRecommendationPayload = {
    suggestions,
    meta: { inputs_hash, generated_at, model: MODEL, prompt_version: PROMPT_VERSION },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "voice_source_character_recommendation",
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
        has_audience: ctx.audienceWho !== null,
      },
    },
  });

  return { persisted: true, substrateId };
}

export async function readVoiceSourceCharacterRecommendation(
  businessId: string,
): Promise<VoiceSourceCharacterRecommendationPayload | null> {
  const row = await getSubstrate<VoiceSourceCharacterRecommendationPayload>(
    businessId,
    "voice_source_character_recommendation",
  );
  return row?.payload ?? null;
}
