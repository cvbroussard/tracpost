/**
 * tagline_examples substrate generator.
 *
 * Per the 2026-06-07 architecture discussion: tagline is a hybrid descriptor.
 * Three states with three handling paths:
 *
 *   1. Brand has a visible tagline on existing surfaces → Public Presence
 *      Analysis surfaces it as verbal.tagline.observed; readiness-finding
 *      resolution lands it in declared. No generator needed.
 *
 *   2. Brand has positioning + tone but no formalized tagline → THIS GENERATOR
 *      produces 3 picker candidates spanning different sticky-tagline patterns
 *      (anti-establishment / diagnostic / audience-anchored / etc.).
 *
 *   3. Brand is cold-start (no positioning yet) → Statistical Recommendation
 *      Engine proposes positioning + tagline together as a bundle. NOT a
 *      tagline-specific picker — positioning has to exist first.
 *
 * This generator handles case (2). It reads positioning + tone + voice +
 * lexicon + audience + GBP + the observed tagline (if any, as a candidate
 * seed) and produces 3 candidates the owner picks from.
 *
 * Model: Haiku 4.5. Cheap (~$0.005/run), fast, text-only (no multimodal
 * needed for short text generation).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { createHash } from "crypto";
import { upsertSubstrate, getSubstrate } from "@/lib/substrate/store";

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "tagline_examples_v1";
const EXAMPLE_COUNT = 3;

const anthropic = new Anthropic();

export interface TaglineExample {
  /** "tagline_a" | "tagline_b" | "tagline_c". */
  id: string;
  /** Short editorial label of the tagline's pattern e.g. "anti-establishment direct". */
  style_label: string;
  /** The actual tagline string. Target 3-7 words for stickiness. */
  tagline: string;
  /** 1-2 sentences explaining why this fits THIS brand specifically. */
  rationale: string;
  /** Word count (model-reported; UI can verify). */
  length_words: number;
}

export interface TaglineExamplesPayload {
  examples: TaglineExample[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
    /** True if one of the candidates was seeded from observation.verbal.tagline (id="incumbent") */
    seeded_from_observation: boolean;
    /** True if one of the candidates was seeded from legacy declared (id="legacy") */
    seeded_from_legacy: boolean;
  };
}

// ── Read brand context ──────────────────────────────────────────────────────

interface BrandContextInputs {
  businessName: string | null;
  websiteUrl: string | null;
  gbpCategories: string[];
  voiceSource: string | null;
  toneAttributes: string[];
  toneExample: string | null;
  /** Positioning angles, joined into a flat readable form. */
  positioningAngles: string[];
  positioningWedge: string | null;
  /** Audience descriptor's "who" + "pains" + "triggers" joined. */
  audienceWho: string | null;
  audiencePains: string[];
  audienceTriggers: string[];
  /** Lexicon vocabulary axes (axis_key → picked term). */
  lexiconPicks: Record<string, string>;
  /** Existing tagline visible on public surfaces (from observation). */
  observedTagline: string | null;
  /**
   * Legacy declared tagline (pre-decomposition single-textarea entry, wrapped
   * by migrate-tagline-decomp-picker-shape.js with selected_example_id="legacy").
   * Included verbatim as a stable-id "legacy" candidate so the picker's
   * selection state persists across regeneration and the owner can keep it.
   */
  legacyDeclaredTagline: string | null;
}

async function readBrandContext(businessId: string): Promise<BrandContextInputs> {
  const [biz] = await sql`
    SELECT name, url FROM businesses WHERE id = ${businessId} LIMIT 1
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
  let positioningWedge: string | null = null;
  let audienceWho: string | null = null;
  let audiencePains: string[] = [];
  let audienceTriggers: string[] = [];
  let lexiconPicks: Record<string, string> = {};

  let legacyDeclaredTagline: string | null = null;

  if (identity?.id) {
    const descriptorRows = await sql`
      SELECT key, declared
      FROM brand_descriptor
      WHERE brand_identity_id = ${identity.id}
        AND key IN ('voice_source', 'tone', 'positioning', 'audience', 'lexicon', 'tagline')
    `;
    for (const r of descriptorRows) {
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
              if (wedge) {
                const stance = wedge.what_we_do;
                const constraint = wedge.design_constraint;
                const parts: string[] = [];
                if (typeof stance === "string" && stance.trim().length > 0) parts.push(stance.trim());
                if (typeof constraint === "string" && constraint.trim().length > 0) parts.push(`(non-negotiable: ${constraint.trim()})`);
                if (parts.length > 0) {
                  positioningAngles.push(parts.join(" "));
                  if (!positioningWedge && typeof stance === "string") {
                    positioningWedge = stance;
                  }
                }
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
      } else if (r.key === "lexicon" && typeof declared === "object" && declared) {
        const obj = declared as Record<string, unknown>;
        const va = obj.vocabulary_axes;
        if (va && typeof va === "object" && !Array.isArray(va)) {
          lexiconPicks = Object.fromEntries(
            Object.entries(va as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === "string",
            ),
          );
        }
      } else if (r.key === "tagline" && typeof declared === "object" && declared) {
        // Legacy declared shape post-migration:
        //   { selected_example: { selected_example_id: "legacy",
        //                         selected_example_text: "<old string>", ... } }
        const obj = declared as Record<string, unknown>;
        const sel = obj.selected_example as Record<string, unknown> | undefined;
        if (
          sel &&
          sel.selected_example_id === "legacy" &&
          typeof sel.selected_example_text === "string" &&
          sel.selected_example_text.trim().length > 0
        ) {
          legacyDeclaredTagline = sel.selected_example_text.trim();
        }
      }
    }
  }

  // Observed tagline from Public Presence Analysis substrate (optional seed)
  let observedTagline: string | null = null;
  const [obsRow] = await sql`
    SELECT payload
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'public_presence_observation'
    LIMIT 1
  `;
  if (obsRow?.payload) {
    const payload = obsRow.payload as Record<string, unknown>;
    const verbal = payload.verbal as Record<string, unknown> | undefined;
    const taglineSlot = verbal?.tagline as { observed?: unknown } | null | undefined;
    if (taglineSlot && typeof taglineSlot.observed === "string") {
      observedTagline = taglineSlot.observed;
    }
  }

  return {
    businessName: (biz?.name as string | null) ?? null,
    websiteUrl: (biz?.url as string | null) ?? null,
    gbpCategories: catRows.map((r) => r.name as string),
    voiceSource,
    toneAttributes,
    toneExample,
    positioningAngles,
    positioningWedge,
    audienceWho,
    audiencePains,
    audienceTriggers,
    lexiconPicks,
    observedTagline,
    legacyDeclaredTagline,
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
    lex: ctx.lexiconPicks,
    obs: ctx.observedTagline,
    legacy: ctx.legacyDeclaredTagline,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

// ── Prompt ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior copy strategist proposing TAGLINE candidates for a brand. Each candidate should be sticky enough that a customer remembers it after one exposure.

WHAT A STRONG TAGLINE LOOKS LIKE:
- SHORT — target 3-7 words. Exceptional ones can run to 10-12; never more.
- A verb with weight (or a striking noun-only construction). Avoid stative verbs like "is/are/be" unless they're doing real work.
- One of these rhythmic devices: rhythm/cadence, alliteration, internal rhyme, inversion, unexpected pairing, an unusual word that catches the ear.
- COMPRESSION of the brand's positioning into the smallest possible carrier. NOT a restatement of services or a generic statement.
- Distinct from positioning itself — positioning EXPLAINS the wedge; tagline COMPRESSES it.

CANDIDATE STRUCTURE:
You ALWAYS produce exactly 3 FRESH candidates with IDs tagline_a, tagline_b, tagline_c. In addition:
- If an OBSERVED INCUMBENT TAGLINE is provided (a tagline the brand ALREADY uses on its public surfaces), include it VERBATIM as an additional candidate with id="incumbent" and style_label="incumbent (already in use)". This is in addition to the 3 fresh — total 4.
- If a LEGACY DECLARED TAGLINE is provided (a prior owner-written tagline migrated from the pre-decomposition single-textarea field), include it VERBATIM as an additional candidate with id="legacy" and style_label="your previous declaration". This is in addition to the 3 fresh — total 4 (or 5 if BOTH observed + legacy exist).
- Total count: 3 (no seeds) | 4 (one seed) | 5 (both seeds). The 3 FRESH candidates remain fresh — do NOT collapse a fresh slot into the legacy or incumbent.
- If observed and legacy taglines are identical word-for-word, emit only one of them (the observed) — don't duplicate.

DISCIPLINE FOR THE 3 FRESH CANDIDATES:
- They must occupy DIFFERENT tagline patterns. Don't propose three variations of the same idea. Spread across: anti-establishment / diagnostic-authority / audience-anchored / craft-quiet / outcome-declarative / inversion / etc.
- Each must be GENRE-APPROPRIATE for the brand's industry — don't propose taglines that wouldn't survive on the brand's actual storefront.
- HONOR the brand's voice — voice_source (founder/team/etc.), tone attributes, and tone example are the voice container. Don't propose a polished corporate line if the brand's voice is direct and adversarial.
- Each candidate's rationale should reference SPECIFIC brand context (the positioning angle, an audience pain, the voice register). Generic rationales ("captures your brand") are noise.

RATIONALE FOR SEEDED CANDIDATES:
- For the incumbent: explain WHY it works (or where it falls short) — owner needs an honest read on whether their existing surface line is the right one to commit to canonical.
- For the legacy: explain how it compares to the incumbent + fresh alternatives. If it's weaker, say so plainly; if it's stronger, say so plainly.

OUTPUT: single valid JSON object: { "examples": [{ "id": "<id>", "style_label": "...", "tagline": "...", "rationale": "...", "length_words": N }, ...] }. IDs as specified above. No prose, no markdown fences.`;
}

function buildUserText(ctx: BrandContextInputs): string {
  const lines: string[] = [];
  lines.push("BRAND CONTEXT");
  if (ctx.businessName) lines.push(`- Business: ${ctx.businessName}`);
  if (ctx.websiteUrl) lines.push(`- Website: ${ctx.websiteUrl}`);
  if (ctx.gbpCategories.length > 0) {
    lines.push(`- GBP categories: ${ctx.gbpCategories.join(", ")}`);
  }

  if (ctx.voiceSource) lines.push(`- Voice source: ${ctx.voiceSource}`);
  if (ctx.toneAttributes.length > 0) {
    lines.push(`- Tone attributes: ${ctx.toneAttributes.join(", ")}`);
  }
  if (ctx.toneExample) {
    lines.push(`- Brand's actual voice (4-sentence example):`);
    lines.push(`    "${ctx.toneExample.replace(/\n/g, " ")}"`);
  }

  if (ctx.positioningAngles.length === 0) {
    lines.push("");
    lines.push("⚠ No positioning declared yet. Generation will fall back to industry-default tagline patterns; results will be generic. Recommend completing positioning before regenerating.");
  } else {
    lines.push(`- Positioning angles (the wedge to compress):`);
    for (const a of ctx.positioningAngles) lines.push(`    · ${a}`);
    if (ctx.positioningWedge) lines.push(`- Primary stance: "${ctx.positioningWedge}"`);
  }

  if (ctx.audienceWho) lines.push(`- Audience: ${ctx.audienceWho}`);
  if (ctx.audiencePains.length > 0) {
    lines.push(`- Audience pains: ${ctx.audiencePains.join(" | ")}`);
  }
  if (ctx.audienceTriggers.length > 0) {
    lines.push(`- Audience triggers: ${ctx.audienceTriggers.join(" | ")}`);
  }

  if (Object.keys(ctx.lexiconPicks).length > 0) {
    lines.push("- Lexicon picks (brand's working vocabulary):");
    for (const [k, v] of Object.entries(ctx.lexiconPicks)) {
      lines.push(`    · ${k.replace(/_/g, " ")} → ${v}`);
    }
  }

  if (ctx.observedTagline) {
    lines.push("");
    lines.push(`OBSERVED INCUMBENT TAGLINE (already in use on the brand's public surfaces):`);
    lines.push(`    "${ctx.observedTagline}"`);
    lines.push(`Include this VERBATIM as an ADDITIONAL candidate with id="incumbent" + style_label="incumbent (already in use)" — in addition to the 3 fresh tagline_a/b/c candidates.`);
  }

  if (ctx.legacyDeclaredTagline) {
    lines.push("");
    lines.push(`LEGACY DECLARED TAGLINE (the brand's prior owner-written tagline, migrated from the old single-textarea field):`);
    lines.push(`    "${ctx.legacyDeclaredTagline}"`);
    lines.push(`Include this VERBATIM as an ADDITIONAL candidate with id="legacy" + style_label="your previous declaration" — in addition to the 3 fresh tagline_a/b/c candidates. If this matches the observed_tagline word-for-word, OMIT the legacy slot (only emit the incumbent).`);
  }

  lines.push("");
  const expected = EXAMPLE_COUNT + (ctx.observedTagline ? 1 : 0) + (ctx.legacyDeclaredTagline && ctx.legacyDeclaredTagline !== ctx.observedTagline ? 1 : 0);
  lines.push(`Produce ${expected} tagline candidates total: ${EXAMPLE_COUNT} fresh (tagline_a, tagline_b, tagline_c)${ctx.observedTagline ? ' + 1 incumbent (id="incumbent")' : ''}${ctx.legacyDeclaredTagline && ctx.legacyDeclaredTagline !== ctx.observedTagline ? ' + 1 legacy (id="legacy")' : ''}.`);
  lines.push(`Return: { "examples": [{ "id": "...", "style_label": "...", "tagline": "...", "rationale": "...", "length_words": N }, ...] }.`);
  return lines.join("\n");
}

// ── Generate ───────────────────────────────────────────────────────────────

export async function generateTaglineExamples(args: {
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

  let parsed: { examples?: TaglineExample[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      persisted: false,
      reason: `model returned non-JSON output (model=${MODEL}); raw text length=${text.length}`,
    };
  }
  const examples = Array.isArray(parsed.examples) ? parsed.examples : [];
  if (examples.length === 0) {
    return { persisted: false, reason: "model returned no examples" };
  }

  const generated_at = new Date().toISOString();
  const payload: TaglineExamplesPayload = {
    examples,
    meta: {
      inputs_hash,
      generated_at,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      seeded_from_observation: ctx.observedTagline !== null,
      seeded_from_legacy:
        ctx.legacyDeclaredTagline !== null &&
        ctx.legacyDeclaredTagline !== ctx.observedTagline,
    },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "tagline_examples",
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
        has_observed_tagline: ctx.observedTagline !== null,
        has_legacy_declared_tagline: ctx.legacyDeclaredTagline !== null,
      },
    },
  });

  return { persisted: true, substrateId };
}

export async function readTaglineExamples(
  businessId: string,
): Promise<TaglineExamplesPayload | null> {
  const row = await getSubstrate<TaglineExamplesPayload>(businessId, "tagline_examples");
  return row?.payload ?? null;
}
