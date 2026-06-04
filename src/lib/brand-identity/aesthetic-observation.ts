/**
 * Aesthetic Phase 2 — the OBSERVATION call.
 *
 * Per [[brand-identity-research-architecture]] (LOCKED 2026-06-03): a research-grade
 * Sonnet 4.6 multimodal call observes the brand factually from public sources and
 * produces canonical observation substrate. NO creative inference. NO recommendations.
 * Downstream production calls (env_look / subject_style candidate generators,
 * eventual Phase 3 owner review) consume this substrate.
 *
 * v1 storage: business_substrate (kind=brand_identity_observation). brand_descriptor
 * [aesthetic].extracted holds a thin pointer so the existing status machine still
 * tracks "was observation run, when, with what model" — the rich payload lives
 * in substrate. Per the locked separate-stores principle of [[substrate-libraries-layer]].
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { upsertSubstrate } from "@/lib/substrate/store";
import type { DescriptorExtractor, ExtractionResult } from "./extract";

const anthropic = new Anthropic();

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "brand_identity_observation_v1";
const MAX_GBP_PHOTOS = 4;

/** GBP categories that signal brand-deliberate creative, in priority order. */
const PRIORITY_GBP_CATEGORIES = [
  "COVER",
  "PROFILE",
  "LOGO",
  "EXTERIOR",
  "INTERIOR",
  "TEAM",
] as const;

// ── The observation payload schema ──────────────────────────────────────────
// Mirrors the schema in [[brand-identity-research-architecture]]. Persisted
// verbatim into business_substrate.payload. Strings are free-form prose by the
// observation model; arrays accumulate discrete observed items.

export interface BrandIdentityObservationPayload {
  research_sources_consulted: string[];
  business_identity_observed: {
    services_offered: string[];
    capabilities_evident: string[];
    audience_signaled: string[];
  };
  visual_presentation_observed: {
    color_palette: string[];
    typography_choices: string[];
    layout_language: string[];
    photographic_treatment_style: string;
    logo_presence_and_usage: string;
  };
  voice_signals_observed: {
    tone_of_copy: string[];
    vocabulary_patterns: string[];
    audience_address_style: string;
  };
  story_signals_observed: {
    about_narrative_summary: string;
    philosophy_or_differentiators: string[];
    proof_visible: string[];
  };
  distinctive_elements_vs_category_defaults: string[];
  gaps_and_absences: string[];
  qualification_assessment: {
    visual_consistency_score: string;
    distinctiveness_score: string;
    alignment_with_positioning_score: string;
    verdict: "type_a" | "type_b" | "type_c" | "type_d";
    confidence: number;
  };
}

// ── Source assembly ─────────────────────────────────────────────────────────

interface BusinessRow {
  id: string;
  name: string | null;
  url: string | null;
}

interface ObservationImage {
  url: string;
  /** Tag passed in the text payload so the model knows what each image is. */
  label: string;
}

interface AssembledObservationSources {
  business: BusinessRow;
  websiteUrl: string | null;
  /** Ordered, deduped image array fed to the multimodal call. */
  images: ObservationImage[];
  gbpCategories: { name: string; isPrimary: boolean }[];
}

async function assembleObservationSources(
  businessId: string,
): Promise<AssembledObservationSources> {
  const [biz] = await sql`
    SELECT id, name, url,
           business_website_screenshot, business_logo, business_favicon,
           gbp_cover_asset_id, gbp_logo_asset_id
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `;
  if (!biz) throw new Error(`aesthetic-observation: business ${businessId} not found`);

  const business: BusinessRow = {
    id: biz.id as string,
    name: biz.name as string | null,
    url: biz.url as string | null,
  };
  const websiteUrl = business.url
    ? business.url.startsWith("http") ? business.url : `https://${business.url}`
    : null;

  // Resolve GBP cover / logo asset URLs from media_assets, if linked.
  const assetIds = [biz.gbp_cover_asset_id, biz.gbp_logo_asset_id].filter(Boolean) as string[];
  const assetUrls = new Map<string, string>();
  if (assetIds.length) {
    const rows = await sql`
      SELECT id, storage_url FROM media_assets WHERE id = ANY(${assetIds})
    `;
    for (const r of rows) {
      if (r.storage_url) assetUrls.set(r.id as string, r.storage_url as string);
    }
  }

  // Priority-filtered GBP photos. ORDER BY array_position pinches the priority
  // categories ahead of any others. synced_at DESC within tier biases toward
  // recent/curated. Caps at MAX_GBP_PHOTOS.
  const photoRows = await sql`
    SELECT gbp_media_url, category
    FROM gbp_photo_sync
    WHERE business_id = ${businessId}
      AND gbp_media_url IS NOT NULL
      AND category = ANY(${PRIORITY_GBP_CATEGORIES as unknown as string[]})
    ORDER BY
      array_position(${PRIORITY_GBP_CATEGORIES as unknown as string[]}, category),
      synced_at DESC NULLS LAST
    LIMIT ${MAX_GBP_PHOTOS}
  `;

  // Build image array in priority order: website screenshot (most signal),
  // then brand logo, then GBP cover, then priority GBP photos. Dedupe by URL
  // so the same R2 file isn't sent twice.
  const images: ObservationImage[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, label });
  };
  push(biz.business_website_screenshot as string | null, "website homepage screenshot");
  push(biz.business_logo as string | null, "brand logo");
  if (biz.gbp_cover_asset_id) push(assetUrls.get(biz.gbp_cover_asset_id as string), "GBP cover photo");
  if (biz.gbp_logo_asset_id) push(assetUrls.get(biz.gbp_logo_asset_id as string), "GBP logo");
  for (const r of photoRows) {
    push(r.gbp_media_url as string, `GBP photo (${r.category as string})`);
  }

  const catRows = await sql`
    SELECT gc.name, sgc.is_primary
    FROM business_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${businessId}
    ORDER BY sgc.is_primary DESC, gc.name ASC
  `;
  const gbpCategories = catRows.map((r) => ({
    name: r.name as string,
    isPrimary: Boolean(r.is_primary),
  }));

  return { business, websiteUrl, images, gbpCategories };
}

// ── The observation prompt ──────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior brand analyst on the first day of an engagement, studying a business from publicly available sources. Your single job is OBSERVATION — capture what is factually evident, exhaustively and without inference.

DISCIPLINE:
- Observe ONLY what is directly evidenced by the sources provided.
- Do NOT recommend, suggest, refine, or propose creative direction.
- Do NOT invent details to fill gaps — name gaps explicitly in gaps_and_absences.
- Do NOT generalize from category priors; report what THIS brand shows, not what brands like this typically show.
- Stay factual: "the website uses warm amber tones and large serif headings" rather than "the brand feels heritage-luxe".

For the qualification_assessment.verdict, choose one:
- type_a: well-established, market-recognized, visually distinctive, internally consistent
- type_b: existing identity but inconsistent across surfaces OR generic-looking
- type_c: existing identity strongly mismatched with what they appear to offer
- type_d: insufficient public presence to observe a coherent identity

confidence is your self-assessed confidence in the verdict, 0.0 to 1.0.

OUTPUT: a single valid JSON object matching the requested schema exactly. No prose, no markdown fences, no commentary outside the JSON.`;
}

function buildUserText(sources: AssembledObservationSources): string {
  const lines: string[] = [];
  lines.push("OBSERVATION TARGET");
  lines.push(`- Business name: ${sources.business.name ?? "(unknown)"}`);
  if (sources.websiteUrl) lines.push(`- Website: ${sources.websiteUrl}`);
  if (sources.gbpCategories.length) {
    lines.push("- GBP categories:");
    for (const c of sources.gbpCategories) {
      lines.push(`    · ${c.name}${c.isPrimary ? " (primary)" : ""}`);
    }
  }
  lines.push("");
  lines.push("IMAGES PROVIDED IN THIS CALL (in order)");
  sources.images.forEach((img, i) => lines.push(`  ${i + 1}. ${img.label}`));
  lines.push("");
  lines.push("REQUIRED OUTPUT SCHEMA");
  lines.push(`{
  "research_sources_consulted": ["..."],
  "business_identity_observed": {
    "services_offered": ["..."],
    "capabilities_evident": ["..."],
    "audience_signaled": ["..."]
  },
  "visual_presentation_observed": {
    "color_palette": ["hex or named color, ..."],
    "typography_choices": ["..."],
    "layout_language": ["..."],
    "photographic_treatment_style": "...",
    "logo_presence_and_usage": "..."
  },
  "voice_signals_observed": {
    "tone_of_copy": ["..."],
    "vocabulary_patterns": ["..."],
    "audience_address_style": "..."
  },
  "story_signals_observed": {
    "about_narrative_summary": "...",
    "philosophy_or_differentiators": ["..."],
    "proof_visible": ["..."]
  },
  "distinctive_elements_vs_category_defaults": ["..."],
  "gaps_and_absences": ["..."],
  "qualification_assessment": {
    "visual_consistency_score": "...",
    "distinctiveness_score": "...",
    "alignment_with_positioning_score": "...",
    "verdict": "type_a|type_b|type_c|type_d",
    "confidence": 0.0
  }
}`);
  return lines.join("\n");
}

// ── The Sonnet 4.6 multimodal call ──────────────────────────────────────────

interface ObservationCallResult {
  payload: BrandIdentityObservationPayload;
  imagesSent: string[];
  rawText: string;
}

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizeMediaType(ct: string | null): AnthropicMediaType {
  const base = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (base === "image/jpeg" || base === "image/jpg") return "image/jpeg";
  if (base === "image/png") return "image/png";
  if (base === "image/gif") return "image/gif";
  if (base === "image/webp") return "image/webp";
  // Default to JPEG — Anthropic's only accepted types are the four above.
  // If the source served something else, the API will reject; treat unknown
  // as a hard failure rather than guessing.
  throw new Error(`aesthetic-observation: unsupported image media type '${ct ?? "(none)"}'`);
}

async function fetchAsInlineImage(
  url: string,
): Promise<{ media_type: AnthropicMediaType; data: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`aesthetic-observation: image fetch ${res.status} for ${url}`);
  }
  const media_type = normalizeMediaType(res.headers.get("content-type"));
  const bytes = Buffer.from(await res.arrayBuffer());
  return { media_type, data: bytes.toString("base64") };
}

async function callObservationModel(
  sources: AssembledObservationSources,
): Promise<ObservationCallResult> {
  if (sources.images.length === 0) {
    throw new Error(
      "aesthetic-observation: no observable images — no website screenshot, brand logo, GBP cover, or priority-category GBP photos available for this brand",
    );
  }

  // Inline base64 — Anthropic's URL-fetch path was being WAF-blocked by our
  // CDN (assets.tracpost.com). We fetch from R2 ourselves and pass inline.
  // Tradeoff: ~33% payload bloat from base64; acceptable for a once-per-brand
  // call. Switch back to URL sources if/when CDN whitelist is in place.
  const inlineImages = await Promise.all(
    sources.images.map((img) => fetchAsInlineImage(img.url)),
  );

  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...inlineImages.map(
      (img): Anthropic.Messages.ContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      }),
    ),
    { type: "text", text: buildUserText(sources) },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let payload: BrandIdentityObservationPayload;
  try {
    payload = JSON.parse(cleaned) as BrandIdentityObservationPayload;
  } catch {
    throw new Error(
      `aesthetic-observation: model returned non-JSON output (model=${MODEL}); raw text length=${text.length}`,
    );
  }

  return { payload, imagesSent: sources.images.map((i) => i.url), rawText: text };
}

// ── The DescriptorExtractor (plugged into the harness for aesthetic) ────────

/**
 * Run the Phase 2 observation for a brand identity, persist the rich payload to
 * business_substrate, and return a thin pointer envelope for the existing
 * brand_descriptor.extracted status machine.
 *
 * `businessId` is extra context the corpus-mining extractors need beyond what
 * AssembledInput carries. The harness resolves it before calling.
 */
export const aestheticObservationExtractor: DescriptorExtractor = async ({
  spec,
  businessId,
}) => {
  if (spec.key !== "aesthetic") {
    throw new Error(
      `aesthetic-observation: wired against descriptor key '${spec.key}'; expected 'aesthetic'`,
    );
  }
  if (!businessId) {
    throw new Error("aesthetic-observation: businessId required in extractor ctx");
  }

  const sources = await assembleObservationSources(businessId);
  const callResult = await callObservationModel(sources);
  const { payload, imagesSent } = callResult;
  const confidence = payload.qualification_assessment?.confidence ?? null;
  const verdict = payload.qualification_assessment?.verdict ?? null;

  const generatedAt = new Date().toISOString();
  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "brand_identity_observation",
    payload: payload as unknown as Record<string, unknown>,
    generationMetadata: {
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      generated_at: generatedAt,
      confidence,
      inputs: {
        website_url: sources.websiteUrl,
        image_count: sources.images.length,
        image_labels: sources.images.map((i) => i.label),
        gbp_category_names: sources.gbpCategories.map((c) => c.name),
      },
    },
  });

  // Thin pointer in brand_descriptor.extracted — the status machine reads this.
  // Rich payload lives in business_substrate (separate-stores lock).
  const result: ExtractionResult = {
    envelope: {
      summary: verdict
        ? `Observation written (${verdict}). See business_substrate row ${substrateId}.`
        : `Observation written. See business_substrate row ${substrateId}.`,
      value: {
        substrate_kind: "brand_identity_observation",
        substrate_id: substrateId,
        verdict,
      },
    },
    model: MODEL,
    confidence,
    inputsSnapshot: {
      prompt_version: PROMPT_VERSION,
      business_id: businessId,
      images_sent: imagesSent,
      gbp_categories: sources.gbpCategories.map((c) => c.name),
      generated_at: generatedAt,
    },
  };
  return result;
};
