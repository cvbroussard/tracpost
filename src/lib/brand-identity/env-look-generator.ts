/**
 * environmental_look_examples substrate generator.
 *
 * Per [[visual-domain-decomposition]] LOCKED 2026-06-04: Sonnet 4.6
 * multimodal observes the brand's source images + the public_presence_
 * observation substrate, produces 3 candidate environmental looks each =
 * caption + array of reference frame indexes into the source-image corpus.
 *
 * Owner picks one via the example_set_picker. Architecturally identical to
 * mechanical_style's example-set picker — different output (image-anchored
 * captions instead of paragraphs) and different model (Sonnet 4.6 multimodal
 * vs Haiku 4.5).
 *
 * The "4-6 reference frames per candidate" target from memory is aspirational
 * — for brands with thin image corpora (B Squared has 3 source images at
 * onboarding), candidates reference whatever's available. Frame INDEXES into
 * the shared corpus, not separate per-candidate assets — the UI renders the
 * same source images per candidate but with different captions guiding what
 * the owner looks at.
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
const PROMPT_VERSION = "environmental_look_examples_v1";

const anthropic = new Anthropic();

export interface EnvLookExample {
  /** "look_a" | "look_b" | "look_c". */
  id: string;
  /** Short label e.g. "real-jobsite mid-process, warm natural light". */
  caption: string;
  /** Indexes into the source-image corpus this candidate draws on. */
  reference_frame_indexes: number[];
  /** 1-2 sentences naming the disposition: lighting + materials + mood. */
  disposition_summary: string;
}

export interface EnvLookExamplesPayload {
  examples: EnvLookExample[];
  /** Stable image URLs aligned to reference_frame_indexes. UI renders these. */
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
  // Pull the visual-domain observation slots + distinctives — these are what
  // a Sonnet observing the brand's surfaces already concluded about its visual
  // character. The generator uses them as PRIOR context, not as constraints.
  const visualObs = (payload as { visual?: Record<string, unknown> }).visual;
  const distinctives = (payload as { distinctive_elements_vs_category_defaults?: string[] })
    .distinctive_elements_vs_category_defaults;
  const summary = JSON.stringify({ visual: visualObs ?? null, distinctives: distinctives ?? null }, null, 0);
  return { substrateId: row.id as string, insights: summary };
}

function hashInputs(corpus: BrandImageCorpus, insights: string | null): string {
  // Cheap deterministic hash for staleness detection. Avoids running Node's
  // crypto for a non-security use case.
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
  return `You are a brand-art director proposing 3 ENVIRONMENTAL LOOK candidates for a brand, so the owner can RECOGNIZE which disposition feels canonical for them.

WHAT "ENVIRONMENTAL LOOK" MEANS:
- Brand-wide DISPOSITION for the kinds of environments / scenes that show up across all the brand's creative
- Captured at the level of: lighting (warm/cool/natural/dramatic/practical), materials + textures (the surfaces and substances that recur), mood (lived-in / just-finished / mid-process / quiet-authority / etc.), production style (real-jobsite vs lifestyle vs controlled studio)
- NOT specific compositions or shot lists — this is the AESTHETIC RANGE the brand operates inside

DISCIPLINE:
- The 3 candidates must be MEANINGFULLY DIFFERENT environmental dispositions the brand could legitimately occupy. If they all sound similar, the owner can't make a real pick.
- Each candidate is GENRE-APPROPRIATE for the brand's industry. Do NOT propose dispositions wildly out of scope (e.g. "industrial warehouse" for a fine-dining brand).
- Anchor each candidate to one or more SOURCE IMAGES via reference_frame_indexes. Indexes are zero-based positions into the source-image array passed in this call.
- caption is short (8-15 words), evocative, names the disposition. Example: "real-jobsite mid-process, warm natural light, brass + plaster + wood signature."
- disposition_summary is 1-2 sentences expanding the caption into lighting + materials + mood. Helps the owner read the candidate without staring at images.

OUTPUT: single valid JSON object: { "examples": [{ "id": "look_a", "caption": "...", "reference_frame_indexes": [0, 2], "disposition_summary": "..." }, ...] }. Exactly 3 examples. IDs are look_a, look_b, look_c in order. No prose, no markdown fences.`;
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
  lines.push("SOURCE IMAGES (zero-indexed; reference these in reference_frame_indexes)");
  corpus.images.forEach((img, i) => lines.push(`  ${i}. ${img.label}`));
  lines.push("");
  if (insights) {
    lines.push("PRIOR OBSERVATION (Sonnet's existing read on this brand's visual character — use as orientation, not as constraint):");
    lines.push(insights);
    lines.push("");
  }
  lines.push(`Produce 3 environmental_look candidates. Same target industry, distinctly different dispositions. Anchor each via reference_frame_indexes into the source-image array above.`);
  lines.push(`Return: { "examples": [{ "id": "look_a", "caption": "...", "reference_frame_indexes": [...], "disposition_summary": "..." }, ...] } — exactly 3 entries.`);
  return lines.join("\n");
}

export async function generateEnvLookExamples(args: {
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

  let parsed: { examples?: EnvLookExample[] };
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
  const payload: EnvLookExamplesPayload = {
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
    kind: "environmental_look_examples",
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

export async function readEnvLookExamples(
  businessId: string,
): Promise<EnvLookExamplesPayload | null> {
  const row = await getSubstrate<EnvLookExamplesPayload>(
    businessId,
    "environmental_look_examples",
  );
  return row?.payload ?? null;
}
