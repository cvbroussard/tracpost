/**
 * subject_style_examples substrate generator.
 *
 * Per [[visual-domain-decomposition]] LOCKED 2026-06-04: Sonnet 4.6 multimodal
 * observes the brand's source images + the public_presence_observation
 * substrate, produces 3 candidate SUBJECT TREATMENT styles. Subject identity
 * (owner-led / crew-led / clients / professional talent / hybrid / no-people)
 * is FOLDED INTO the candidate content — each example naturally embeds a
 * subject identity choice, owner picking the candidate ALSO picks the
 * identity.
 *
 * Architecturally identical to env_look — different prompt focusing on
 * who/what appears + how they're treated photographically (posed vs candid;
 * direct-to-camera vs documentary; people vs work-only).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { upsertSubstrate, getSubstrate } from "@/lib/substrate/store";
import {
  assembleBrandImageCorpus,
  fetchAsInlineImage,
  type BrandImageCorpus,
} from "./observation-source-images";

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "subject_style_examples_v1";

const anthropic = new Anthropic();

export interface SubjectStyleExample {
  /** "subject_a" | "subject_b" | "subject_c". */
  id: string;
  /** Short label e.g. "crew-led documentary, candid mid-action". */
  caption: string;
  /** Indexes into the source-image corpus. */
  reference_frame_indexes: number[];
  /** 1-2 sentences naming subject identity + treatment posture + framing. */
  disposition_summary: string;
}

export interface SubjectStyleExamplesPayload {
  examples: SubjectStyleExample[];
  source_images: { url: string; label: string }[];
  meta: {
    inputs_hash: string;
    source_substrate_id: string | null;
    generated_at: string;
    model: string;
    prompt_version: string;
  };
}

async function readObservationInsights(businessId: string): Promise<{
  substrateId: string | null;
  insights: string | null;
}> {
  const [row] = await sql`
    SELECT id, payload
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'public_presence_observation'
    LIMIT 1
  `;
  if (!row) return { substrateId: null, insights: null };
  const payload = row.payload as Record<string, unknown> | null;
  if (!payload) return { substrateId: row.id as string, insights: null };
  // Pull visual subject_style observation if present + distinctives
  const visualObs = (payload as { visual?: Record<string, unknown> }).visual;
  const distinctives = (payload as { distinctive_elements_vs_category_defaults?: string[] })
    .distinctive_elements_vs_category_defaults;
  const summary = JSON.stringify({ visual: visualObs ?? null, distinctives: distinctives ?? null }, null, 0);
  return { substrateId: row.id as string, insights: summary };
}

function hashInputs(corpus: BrandImageCorpus, insights: string | null): string {
  const stable = JSON.stringify({
    biz: corpus.business.id,
    images: corpus.images.map((i) => i.url),
    cats: corpus.gbpCategories.map((c) => c.name).sort(),
    has_insights: insights !== null,
  });
  let h = 5381;
  for (let i = 0; i < stable.length; i++) {
    h = ((h << 5) + h + stable.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0").slice(0, 16);
}

function buildSystemPrompt(): string {
  return `You are a brand-art director proposing 3 SUBJECT TREATMENT candidates for a brand, so the owner can RECOGNIZE which subject style feels canonical for them.

WHAT "SUBJECT STYLE" MEANS:
- Brand-wide DISPOSITION for who/what appears in the brand's creative AND how they're photographed
- Captured at the level of:
  - Subject identity (founder-led talking-head, crew-led documentary, clients as subjects, professional talent, hybrid, or no-people-work-only)
  - Photographic treatment (posed-portrait, candid mid-action, documentary observer, environmental wide, macro-detail, etc.)
  - Direction (direct-to-camera, looking-away, no-eye-contact, etc.)
- Subject identity is NOT a separate pre-step — each candidate's content NATURALLY EMBEDS a subject identity. Owner picking a candidate also picks the identity.

DISCIPLINE:
- The 3 candidates must SPAN the realistic identity range surfaced by observation. If only people work for this brand makes sense, all 3 might be people-led but vary in posing/framing. If both people-led AND product-only are legitimate, give the owner that contrast.
- GENRE-APPROPRIATE only. Don't propose talent-driven subjects for a brand that only photographs their work.
- Anchor each candidate via reference_frame_indexes into the source-image array.
- caption is 8-15 words, names subject identity + posture + framing in plain language. Example: "crew-led documentary, mid-action environmental wide, no direct-to-camera."
- disposition_summary is 1-2 sentences expanding on the caption — who appears, how they're treated, what the viewer feels.

OUTPUT: single valid JSON object: { "examples": [{ "id": "subject_a", "caption": "...", "reference_frame_indexes": [0, 2], "disposition_summary": "..." }, ...] }. Exactly 3 examples. IDs are subject_a, subject_b, subject_c in order. No prose, no markdown fences.`;
}

function buildUserText(corpus: BrandImageCorpus, insights: string | null): string {
  const lines: string[] = [];
  lines.push("BRAND CONTEXT");
  if (corpus.business.name) lines.push(`- Business: ${corpus.business.name}`);
  if (corpus.websiteUrl) lines.push(`- Website: ${corpus.websiteUrl}`);
  if (corpus.gbpCategories.length > 0) {
    lines.push("- GBP categories (industry context):");
    for (const c of corpus.gbpCategories) lines.push(`    · ${c.name}${c.isPrimary ? " (primary)" : ""}`);
  }
  lines.push("");
  lines.push("SOURCE IMAGES (zero-indexed; reference in reference_frame_indexes)");
  corpus.images.forEach((img, i) => lines.push(`  ${i}. ${img.label}`));
  lines.push("");
  if (insights) {
    lines.push("PRIOR OBSERVATION (Sonnet's read on this brand — orientation, not constraint):");
    lines.push(insights);
    lines.push("");
  }
  lines.push(`Produce 3 subject_style candidates. Each candidate naturally embeds a subject identity choice; owner picks the candidate they recognize.`);
  lines.push(`Return: { "examples": [{ "id": "subject_a", "caption": "...", "reference_frame_indexes": [...], "disposition_summary": "..." }, ...] } — exactly 3 entries.`);
  return lines.join("\n");
}

export async function generateSubjectStyleExamples(args: {
  businessId: string;
}): Promise<{ persisted: boolean; substrateId?: string; reason?: string }> {
  const { businessId } = args;

  const corpus = await assembleBrandImageCorpus(businessId);
  if (corpus.images.length === 0) {
    return { persisted: false, reason: "no source images available — upload website screenshot + logo first" };
  }
  const { substrateId: sourceSubstrateId, insights } = await readObservationInsights(businessId);
  const inputs_hash = hashInputs(corpus, insights);

  const inlineImages = await Promise.all(corpus.images.map((img) => fetchAsInlineImage(img.url)));

  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...inlineImages.map(
      (img): Anthropic.Messages.ContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      }),
    ),
    { type: "text", text: buildUserText(corpus, insights) },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let parsed: { examples?: SubjectStyleExample[] };
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
  const payload: SubjectStyleExamplesPayload = {
    examples,
    source_images: corpus.images.map((i) => ({ url: i.url, label: i.label })),
    meta: {
      inputs_hash,
      source_substrate_id: sourceSubstrateId,
      generated_at,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
    },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "subject_style_examples",
    payload: payload as unknown as Record<string, unknown>,
    generationMetadata: {
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      generated_at,
      inputs_hash,
      inputs: {
        business_name: corpus.business.name,
        gbp_categories: corpus.gbpCategories.map((c) => c.name),
        source_image_count: corpus.images.length,
        source_substrate_id: sourceSubstrateId,
      },
    },
  });

  return { persisted: true, substrateId };
}

export async function readSubjectStyleExamples(
  businessId: string,
): Promise<SubjectStyleExamplesPayload | null> {
  const row = await getSubstrate<SubjectStyleExamplesPayload>(
    businessId,
    "subject_style_examples",
  );
  return row?.payload ?? null;
}
