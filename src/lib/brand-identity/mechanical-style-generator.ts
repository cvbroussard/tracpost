/**
 * mechanical_style_examples substrate generator.
 *
 * Per [[verbal-domain-decomposition]] LOCKED 2026-06-03: LLM produces 3
 * industry-specific paragraphs each demonstrating a DISTINCT mechanical style
 * (rhythm, sentence-length, punctuation conventions, casing). Owner picks one;
 * the picked paragraph IS the declared mechanical style. Substrate is system-
 * scaffolded; declaration is owner-led.
 *
 * Triggered after voice_source + tone.attributes filled (per memory). v1
 * accepts triggers from any state — generator works with whatever brand
 * context exists and uses industry defaults when descriptors are empty.
 *
 * Model: Haiku 4.5 per memory's locked Haiku-class option for scaffolded
 * pickers. Cheap (~$0.005-0.01 per generation) + fast.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { upsertSubstrate, getSubstrate } from "@/lib/substrate/store";
import { createHash } from "crypto";

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "mechanical_style_examples_v1";
const EXAMPLE_COUNT = 3;

const anthropic = new Anthropic();

export interface MechanicalStyleExample {
  id: string;          // e.g. "style_a", "style_b", "style_c"
  style_label: string; // short label e.g. "crisp & fragmented", "warm & rolling"
  paragraph: string;   // 4-6 sentences demonstrating the style
}

export interface MechanicalStyleExamplesPayload {
  examples: MechanicalStyleExample[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
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
    const descriptorRows = await sql`
      SELECT key, declared
      FROM brand_descriptor
      WHERE brand_identity_id = ${identity.id}
        AND key IN ('voice_source', 'tone')
    `;
    for (const r of descriptorRows) {
      const declared = r.declared as unknown;
      if (r.key === "voice_source") {
        if (typeof declared === "string") {
          voiceSource = declared;
        } else if (declared && typeof declared === "object") {
          const obj = declared as Record<string, unknown>;
          voiceSource =
            typeof obj.source === "string" ? obj.source : null;
        }
      } else if (r.key === "tone") {
        if (typeof declared === "object" && declared) {
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

// ── The prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior copy strategist drafting MECHANICAL STYLE reference examples for a brand. Your job is to produce 3 short paragraphs, each demonstrating a DISTINCT mechanical style, so the brand's owner can RECOGNIZE which one sounds like them.

WHAT "MECHANICAL STYLE" MEANS (per the brand-identity-schema):
- Sentence rhythm — crisp short bursts vs medium flowing vs long winding
- Sentence-length pattern — uniform vs varied vs deliberately alternating
- Fragment policy — fragments freely vs only-for-emphasis vs never
- Em-dash + comma + parenthetical conventions
- Casing of headings (if relevant in prose), capitalization habits
- Emoji policy (none / accent / heavy)
- Hashtag posture (when applicable to the surface; usually omit in prose-prose examples)
- Sentence-opening variety (always with subject vs frequent inversions vs interjections)

DISCIPLINE:
- The 3 paragraphs must be MEANINGFULLY DIFFERENT from each other on these mechanical dimensions. If they all sound similar, the owner can't make a real pick.
- Each paragraph should be GENRE-APPROPRIATE for the brand (use their actual industry / category context, not generic copy).
- Same TOPIC across paragraphs — different mechanical styles applied to the SAME content. (e.g. all 3 paragraphs describe the brand's services, but one is crisp/fragmented, one is warm/rolling, one is technical/precise.)
- 4-6 sentences each. Long enough to demonstrate rhythm; short enough to compare side by side.
- Do NOT explicitly LABEL the mechanical traits in the paragraphs ("Crisp. Like this."). Just demonstrate them through the writing.
- Each paragraph gets a short label (2-4 words) summarizing its mechanical character (e.g. "crisp & fragmented", "warm & rolling", "technical & precise"). The label is editorial shorthand for the owner.

OUTPUT: single valid JSON object: { "examples": [{ "id": "style_a", "style_label": "...", "paragraph": "..." }, ...] }. Exactly 3 examples. IDs are style_a, style_b, style_c in order. No prose, no markdown fences.`;
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
    lines.push(`- Tone attributes (3 defining): ${ctx.toneAttributes.join(", ")}`);
  }
  if (ctx.toneExample) {
    lines.push("- Owner's own brand copy (their natural voice — match the spirit, vary the mechanics):");
    lines.push(`    "${ctx.toneExample.replace(/\n/g, " ")}"`);
  }

  lines.push("");
  lines.push("INSTRUCTIONS");
  lines.push("Produce 3 paragraphs, each describing what this brand does (its core service / value), each using a DISTINCT mechanical style. Same topic, different rhythm and structure. 4-6 sentences each.");
  lines.push("");
  lines.push(`Return: { "examples": [{ "id": "style_a", "style_label": "...", "paragraph": "..." }, ...] } — exactly ${EXAMPLE_COUNT} entries, IDs style_a/style_b/style_c.`);
  return lines.join("\n");
}

// ── Generate ──────────────────────────────────────────────────────────────

export async function generateMechanicalStyleExamples(args: {
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

  let parsed: { examples?: MechanicalStyleExample[] };
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
  const payload: MechanicalStyleExamplesPayload = {
    examples,
    meta: {
      inputs_hash,
      generated_at,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
    },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "mechanical_style_examples",
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

export async function readMechanicalStyleExamples(
  businessId: string,
): Promise<MechanicalStyleExamplesPayload | null> {
  const row = await getSubstrate<MechanicalStyleExamplesPayload>(
    businessId,
    "mechanical_style_examples",
  );
  return row?.payload ?? null;
}
