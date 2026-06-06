/**
 * lexicon_axes substrate generator.
 *
 * Per [[verbal-domain-decomposition]] LOCKED 2026-06-03: LLM produces 6-10
 * industry-specific vocabulary axes per brand. Each axis is a meaningful
 * lexical choice in the brand's industry (e.g. "who you sell to": Homeowner /
 * Client / Customer / Property owner). Owner picks one term per axis. The
 * picked terms become the brand's working vocabulary.
 *
 * Pattern mirrors mechanical_style_examples — same shape (read brand context →
 * Haiku call → persist substrate). Different output structure (matrix of axes
 * rather than paragraphs).
 *
 * Model: Haiku 4.5. Cheap (~$0.005 per generation) + fast.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { createHash } from "crypto";
import { upsertSubstrate, getSubstrate } from "@/lib/substrate/store";

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "lexicon_axes_v1";
const TARGET_AXIS_COUNT_MIN = 6;
const TARGET_AXIS_COUNT_MAX = 10;

const anthropic = new Anthropic();

export interface LexiconAxis {
  /** snake_case identifier; persistent across regenerations as much as possible. */
  axis_key: string;
  /** Display label shown to the owner (e.g. "Who you sell to"). */
  label: string;
  /** 3-4 commonly-used terms in this brand's industry. */
  terms: string[];
  /** Optional one-sentence guidance shown to the owner under the label. */
  hint?: string;
}

export interface LexiconAxesPayload {
  axes: LexiconAxis[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
  };
}

// ── Read brand context (mirrors mechanical-style-generator) ────────────────

interface BrandContextInputs {
  businessName: string | null;
  websiteUrl: string | null;
  gbpCategories: string[];
  voiceSource: string | null;
  toneAttributes: string[];
  toneExample: string | null;
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
  if (identity?.id) {
    const rows = await sql`
      SELECT key, declared
      FROM brand_descriptor
      WHERE brand_identity_id = ${identity.id}
        AND key IN ('voice_source', 'tone')
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
      }
    }
  }

  return {
    businessName: (biz?.name as string | null) ?? null,
    websiteUrl: (biz?.url as string | null) ?? null,
    gbpCategories: catRows.map((r) => r.name as string),
    voiceSource,
    toneAttributes,
    toneExample,
  };
}

function hashInputs(ctx: BrandContextInputs): string {
  const stable = JSON.stringify({
    name: ctx.businessName,
    cats: [...ctx.gbpCategories].sort(),
    voice: ctx.voiceSource,
    attrs: [...ctx.toneAttributes].sort(),
    example: ctx.toneExample,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

// ── Prompt ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a brand-vocabulary strategist. Your job is to propose ${TARGET_AXIS_COUNT_MIN}-${TARGET_AXIS_COUNT_MAX} VOCABULARY AXES for a specific brand, so the owner can declare their working vocabulary by picking per axis.

WHAT A "VOCABULARY AXIS" IS:
- A meaningful lexical choice within the brand's industry where ALTERNATIVES EXIST
- Each axis has 3-4 commonly-used terms in this category
- The owner picks ONE term per axis (the one that's most natural to their brand) — or marks it "Interchangeable" if they have no preference — or adds a custom term

EXAMPLES (drawn from contracting/remodeling, for illustration; choose axes appropriate to THIS brand's industry):
- axis_key="who_you_sell_to", label="Who you sell to", terms=["Homeowner", "Client", "Customer", "Property owner"]
- axis_key="what_you_do", label="What you do", terms=["Renovation", "Remodel", "Construction", "Build"]
- axis_key="your_people", label="Your people", terms=["Team", "Crew", "Craftsmen", "Folks"]
- axis_key="first_meeting", label="First meeting with a prospect", terms=["Discovery Consultation", "Walk-through", "Estimate", "Site visit"]
- axis_key="work_output", label="What you call the work", terms=["Project", "Job", "Build", "Engagement"]
- axis_key="physical_workspace", label="Your physical workspace", terms=["Office", "Shop", "Workshop", "Studio"]
- axis_key="brand_self_reference", label="How the brand refers to itself", terms=["Company name", "Short nickname", "We", "Our team"]
- axis_key="expertise_framing", label="Expertise framing", terms=["Experience", "Expertise", "Craftsmanship", "Know-how"]

DISCIPLINE:
- Axes must be MEANINGFUL choices for THIS brand's industry. Generic axes ("formality level") add noise. Industry-specific axes ("first meeting with a prospect") add signal.
- Each axis's terms must be PLAUSIBLE alternatives in the brand's category. Don't include obvious cliches the brand should avoid.
- Axes should be ORTHOGONAL — different axes capture different vocabulary decisions, not slight variations of the same.
- ${TARGET_AXIS_COUNT_MIN}-${TARGET_AXIS_COUNT_MAX} axes total. Lean toward ${TARGET_AXIS_COUNT_MAX} if the brand's industry is vocabulary-rich; ${TARGET_AXIS_COUNT_MIN} if narrow.
- axis_key MUST be stable snake_case. Use the same axis_key in future runs if the same concept comes up — this helps owner consistency across regenerations.
- Hints are optional one-sentence guidance ("often appears in your opening copy") shown under the axis label. Keep them short.

OUTPUT: single valid JSON object: { "axes": [{ "axis_key": "...", "label": "...", "terms": ["..."], "hint": "..." }, ...] }. ${TARGET_AXIS_COUNT_MIN}-${TARGET_AXIS_COUNT_MAX} entries. No prose, no markdown fences.`;
}

function buildUserText(ctx: BrandContextInputs): string {
  const lines: string[] = [];
  lines.push("BRAND CONTEXT");
  if (ctx.businessName) lines.push(`- Business: ${ctx.businessName}`);
  if (ctx.websiteUrl) lines.push(`- Website: ${ctx.websiteUrl}`);
  if (ctx.gbpCategories.length > 0) {
    lines.push("- GBP categories (industry context):");
    for (const c of ctx.gbpCategories) lines.push(`    · ${c}`);
  }
  if (ctx.voiceSource) lines.push(`- Voice source: ${ctx.voiceSource}`);
  if (ctx.toneAttributes.length > 0) {
    lines.push(`- Tone attributes: ${ctx.toneAttributes.join(", ")}`);
  }
  if (ctx.toneExample) {
    lines.push("- Owner's brand copy (their natural voice — match the spirit):");
    lines.push(`    "${ctx.toneExample.replace(/\n/g, " ")}"`);
  }
  lines.push("");
  lines.push(`Generate ${TARGET_AXIS_COUNT_MIN}-${TARGET_AXIS_COUNT_MAX} vocabulary axes appropriate to THIS brand's industry.`);
  lines.push(`Return: { "axes": [{ "axis_key": "...", "label": "...", "terms": ["..."], "hint": "..." }, ...] }.`);
  return lines.join("\n");
}

// ── Generate ──────────────────────────────────────────────────────────────

export async function generateLexiconAxes(args: {
  businessId: string;
}): Promise<{ persisted: boolean; substrateId?: string; reason?: string }> {
  const { businessId } = args;

  const ctx = await readBrandContext(businessId);
  const inputs_hash = hashInputs(ctx);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserText(ctx) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let parsed: { axes?: LexiconAxis[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      persisted: false,
      reason: `model returned non-JSON output (model=${MODEL}); raw text length=${text.length}`,
    };
  }
  const axes = Array.isArray(parsed.axes) ? parsed.axes : [];
  if (axes.length === 0) {
    return { persisted: false, reason: "model returned no axes" };
  }

  const generated_at = new Date().toISOString();
  const payload: LexiconAxesPayload = {
    axes,
    meta: {
      inputs_hash,
      generated_at,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
    },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "lexicon_axes",
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
      },
    },
  });

  return { persisted: true, substrateId };
}

export async function readLexiconAxes(
  businessId: string,
): Promise<LexiconAxesPayload | null> {
  const row = await getSubstrate<LexiconAxesPayload>(businessId, "lexicon_axes");
  return row?.payload ?? null;
}
