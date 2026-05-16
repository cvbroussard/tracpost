/**
 * Stage 2 of the briefing-complete cascade — multimodal asset analysis.
 *
 * Per project_tracpost_asset_analysis_cascade memory:
 * - Sonnet 4.6 vision call (~$0.02, ~3-5s)
 * - Input: image + transcript + Stage 1 entities + site categories + brand DNA digest
 * - Output: ONE canonical artifact (asset_categories, scene_types,
 *   detected_vendors, url_slug, story_angles, suggested_pillar,
 *   caption_hints)
 * - Persists to asset_analysis JSONB column + asset_categories table
 *   + asset_brands join (for confirmed vendors)
 *
 * Universal rule: array outputs are salience/confidence-ranked.
 * Position [0] is the top. No separate primary_X fields except for
 * asset_categories.primary which has special DB semantics.
 *
 * Replaces (and merges) the responsibilities of:
 * - Legacy triage.ts vision call (scene_types, suggested_tags,
 *   detected_vendors, url_slug, story_angles, suggested_pillar)
 * - asset-categorizer.ts (asset_categories)
 *
 * Both fold into this single Stage 2 call.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { SCENE_TYPES, SCENE_TYPE_IDS } from "@/lib/scene-types";
import type { Stage1Result } from "./stage1-extract";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AssetCategoryAssignment {
  gcid: string;
  name: string;
  confidence: number;
  reasoning: string;
}

export interface DetectedVendor {
  brand_slug: string;
  brand_name: string;
  transcript_match: boolean;
  visual_evidence: string | null;
  confidence: number;
}

export interface Stage2Result {
  asset_categories: {
    primary: AssetCategoryAssignment;
    secondaries: AssetCategoryAssignment[];
    allRanked: AssetCategoryAssignment[];
  };
  scene_types: string[];
  detected_vendors: DetectedVendor[];
  url_slug: string;
  story_angles: string[];
  suggested_pillar: string | null;
  caption_hints: {
    tone: string;
    voice_anchor: string;
    key_phrases_to_use: string[];
    phrases_to_avoid: string[];
    audience: string;
    lead_with: string;
  };
  cost: { input_tokens: number; output_tokens: number };
}

export type Stage2Outcome =
  | { status: "success"; result: Stage2Result }
  | { status: "skipped"; reason: "no_site_categories" | "no_image" }
  | { status: "error"; error: string };

interface Stage2Input {
  assetId: string;
  imageUrl: string;
  transcript: string;
  stage1: Stage1Result | null;
  siteCategories: Array<{ gcid: string; name: string }>;
  siteBrands: Array<{ id: string; slug: string; name: string }>;
  brandDnaDigest: string | null;
  pillarOptions: string[];
}

function buildSystemPrompt(): string {
  return `You are TracPost's multimodal asset analyzer. Given an asset image (or video poster) + the subscriber's transcript + pre-extracted entities + the site's declared GBP categories + brand DNA hints, produce ONE canonical analysis artifact in strict JSON.

You are the SECOND stage of a two-stage cascade. Stage 1 already extracted entities (brands, projects, specialties, locations, materials) and suggested tags from the transcript text. Your job is to add the visual + multimodal reasoning that text alone can't provide.

OUTPUTS (all required):

1. **asset_categories** — Classify the asset into the site's declared GBP categories.
   - primary: the single best match (always assigned, even at low confidence)
   - secondaries: 0-2 additional categories, ONLY at confidence ≥0.85 AND only if the asset genuinely spans multiple categories
   - allRanked: ALL site categories sorted by confidence descending (for inspector/debug)
   - Each entry: { gcid, confidence (0..1), reasoning (cite transcript + visual evidence) }
   - NEVER invent gcids — only use ones from the site's category list provided

2. **scene_types** — From the fixed taxonomy provided in the user message, pick any/all that strictly match the operator's canonical description (NOT your default interpretation of the slug name). Each scene type has a specific definition — match against the description text, not what the slug "sounds like" in general photography vocabulary. Return as salience-ranked array (position [0] = most prominent). The taxonomy is cross-cutting (an asset can legitimately be multiple), do not arbitrarily limit count. But do not over-apply — if the description doesn't fit, leave it out.

3. **detected_vendors** — Brand vendors visible IN THE IMAGE, cross-referenced against the site's brand catalog AND Stage 1's brand NER. For each detected vendor:
   - brand_slug: must match a slug from the site's brand catalog provided
   - transcript_match: true if Stage 1 also extracted this brand from transcript
   - visual_evidence: specific description of what in the image suggests this brand (or null if confidence rests on transcript alone)
   - confidence (0..1): 0.9+ for dual-modal confirmation, 0.7-0.85 for transcript-only or visual-only, <0.7 for weak signal
   Returned in confidence-descending order. Empty array if no vendors detected.

4. **url_slug** — SEO-friendly kebab-case slug (~6-10 words) anchored in the most distinctive content of the asset. Include project name if present, primary visual feature, location if relevant. Example: "shadyside-parlor-walnut-cabinetry-restoration".

5. **story_angles** — Narrative angles the asset supports. Salience-ranked. Use lowercase snake_case. Examples: transformation, craftsmanship_detail, client_lifestyle, process_showcase, before_after, problem_solving.

6. **suggested_pillar** — Single content pillar from the site's pillar options provided. If none clearly applies, return null.

7. **caption_hints** — Guidance for downstream caption generator (NOT the caption itself):
   - tone: short phrase describing voice ("confident, technical, craftsmanship-forward")
   - voice_anchor: a specific phrase from the transcript that captures the subscriber's voice
   - key_phrases_to_use: 2-5 specific terms from transcript that should appear in the caption
   - phrases_to_avoid: optional, things that don't fit the brand voice
   - audience: who this caption is FOR ("homeowners seeking high-end historic restoration")
   - lead_with: what the first line of the caption should emphasize

CRITICAL RULES:

- **TRANSCRIPT IS PRIMARY SIGNAL.** When transcript and image conflict, weight transcript higher.
- **NEVER INVENT.** Only use gcids from site's category list. Only use brand_slugs from site's brand catalog. Only use scene_types from the fixed taxonomy. Only use pillars from site's options.
- **CITE EVIDENCE.** Every reasoning field should reference specific transcript phrases AND specific visual features.
- **RANK BY SALIENCE.** All array outputs descending by relevance/confidence. Position [0] is the top.

OUTPUT: Return ONLY a JSON object matching the spec. No prose, no markdown code fences. Strict JSON.`;
}

function buildUserMessage(input: Stage2Input): string {
  const lines: string[] = [];

  lines.push("=== ASSET TRANSCRIPT ===\n");
  lines.push(input.transcript.trim());
  lines.push("");

  if (input.stage1) {
    lines.push("=== STAGE 1 ENTITIES (pre-extracted from transcript) ===\n");
    const e = input.stage1.entities;
    if (e.brands.length) lines.push(`Brands mentioned: ${e.brands.map((b) => b.text).join(", ")}`);
    if (e.projects.length) lines.push(`Projects mentioned: ${e.projects.map((p) => p.text).join(", ")}`);
    if (e.specialties.length) lines.push(`Specialties / work themes: ${e.specialties.map((s) => s.text).join(", ")}`);
    if (e.locations.length) lines.push(`Locations: ${e.locations.map((l) => `${l.text} (${l.type})`).join(", ")}`);
    if (e.materials.length) lines.push(`Materials: ${e.materials.map((m) => m.text).join(", ")}`);
    if (input.stage1.suggested_tags.length) lines.push(`Stage 1 suggested tags: ${input.stage1.suggested_tags.join(", ")}`);
    lines.push("");
  }

  lines.push("=== SITE'S DECLARED GBP CATEGORIES (pick asset_categories from these) ===\n");
  for (const c of input.siteCategories) {
    lines.push(`  ${c.gcid}  →  ${c.name}`);
  }
  lines.push("");

  lines.push("=== SITE'S BRAND CATALOG (detected_vendors must use these slugs) ===\n");
  if (input.siteBrands.length === 0) {
    lines.push("(no brands in catalog — detected_vendors will be empty)");
  } else {
    for (const b of input.siteBrands) {
      lines.push(`  ${b.slug}  →  ${b.name}`);
    }
  }
  lines.push("");

  lines.push("=== ALLOWED SCENE_TYPES (match against the description, not just the slug name) ===\n");
  for (const t of SCENE_TYPES) {
    lines.push(`  ${t.id} — ${t.description}`);
  }
  lines.push("");

  if (input.pillarOptions.length > 0) {
    lines.push("=== SITE'S PILLAR OPTIONS (suggested_pillar must be one of these or null) ===\n");
    lines.push(input.pillarOptions.join(", "));
    lines.push("");
  }

  if (input.brandDnaDigest) {
    lines.push("=== BRAND DNA DIGEST ===\n");
    lines.push(input.brandDnaDigest);
    lines.push("");
  }

  lines.push("=== ASK ===\n");
  lines.push("Analyze the asset image (provided above) using all signals. Return the JSON artifact per system prompt.");

  return lines.join("\n");
}

async function fetchImageBase64(
  url: string,
): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch asset image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (contentType.includes("png")) mediaType = "image/png";
  else if (contentType.includes("gif")) mediaType = "image/gif";
  else if (contentType.includes("webp")) mediaType = "image/webp";
  return { data: buf.toString("base64"), mediaType };
}

export async function runStage2(input: Stage2Input): Promise<Stage2Outcome> {
  if (input.siteCategories.length === 0) return { status: "skipped", reason: "no_site_categories" };
  if (!input.imageUrl) return { status: "skipped", reason: "no_image" };

  try {
    const { data, mediaType } = await fetchImageBase64(input.imageUrl);

    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: buildUserMessage(input) },
          ],
        },
      ],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM returned no JSON object");
    const parsed = JSON.parse(match[0]) as {
      asset_categories?: {
        primary?: { gcid: string; confidence: number; reasoning: string };
        secondaries?: Array<{ gcid: string; confidence: number; reasoning: string }>;
        allRanked?: Array<{ gcid: string; confidence: number; reasoning: string }>;
      };
      scene_types?: string[];
      detected_vendors?: Array<{
        brand_slug: string;
        transcript_match: boolean;
        visual_evidence: string | null;
        confidence: number;
      }>;
      url_slug?: string;
      story_angles?: string[];
      suggested_pillar?: string | null;
      caption_hints?: {
        tone?: string;
        voice_anchor?: string;
        key_phrases_to_use?: string[];
        phrases_to_avoid?: string[];
        audience?: string;
        lead_with?: string;
      };
    };

    // Validate gcids against site catalog (anti-hallucination)
    const validGcids = new Set(input.siteCategories.map((c) => c.gcid));
    const nameByGcid = new Map(input.siteCategories.map((c) => [c.gcid, c.name]));
    if (!parsed.asset_categories?.primary?.gcid || !validGcids.has(parsed.asset_categories.primary.gcid)) {
      throw new Error(`Invalid or missing primary gcid: ${parsed.asset_categories?.primary?.gcid}`);
    }

    const enrichCat = (c: { gcid: string; confidence: number; reasoning: string }): AssetCategoryAssignment => ({
      gcid: c.gcid,
      name: nameByGcid.get(c.gcid) || c.gcid,
      confidence: c.confidence,
      reasoning: c.reasoning,
    });

    // Validate scene_types against fixed taxonomy
    const validScenes = new Set(SCENE_TYPE_IDS);
    const sceneTypes = (parsed.scene_types || []).filter((s) => validScenes.has(s));

    // Validate detected_vendors against brand catalog
    const brandBySlug = new Map(input.siteBrands.map((b) => [b.slug, b]));
    const detectedVendors: DetectedVendor[] = (parsed.detected_vendors || [])
      .filter((v) => brandBySlug.has(v.brand_slug))
      .map((v) => ({
        brand_slug: v.brand_slug,
        brand_name: brandBySlug.get(v.brand_slug)?.name || v.brand_slug,
        transcript_match: v.transcript_match,
        visual_evidence: v.visual_evidence,
        confidence: v.confidence,
      }));

    // Validate pillar
    const validPillars = new Set(input.pillarOptions);
    const suggestedPillar = parsed.suggested_pillar && validPillars.has(parsed.suggested_pillar)
      ? parsed.suggested_pillar
      : null;

    const result: Stage2Result = {
      asset_categories: {
        primary: enrichCat(parsed.asset_categories.primary),
        secondaries: (parsed.asset_categories.secondaries || [])
          .filter((s) => validGcids.has(s.gcid) && s.confidence >= 0.85)
          .slice(0, 2)
          .map(enrichCat),
        allRanked: (parsed.asset_categories.allRanked || [])
          .filter((r) => validGcids.has(r.gcid))
          .map(enrichCat),
      },
      scene_types: sceneTypes,
      detected_vendors: detectedVendors,
      url_slug: parsed.url_slug || "",
      story_angles: parsed.story_angles || [],
      suggested_pillar: suggestedPillar,
      caption_hints: {
        tone: parsed.caption_hints?.tone || "",
        voice_anchor: parsed.caption_hints?.voice_anchor || "",
        key_phrases_to_use: parsed.caption_hints?.key_phrases_to_use || [],
        phrases_to_avoid: parsed.caption_hints?.phrases_to_avoid || [],
        audience: parsed.caption_hints?.audience || "",
        lead_with: parsed.caption_hints?.lead_with || "",
      },
      cost: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      },
    };

    return { status: "success", result };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Persist Stage 2 result to:
 *   - media_assets.asset_analysis JSONB (the full artifact including Stage 1)
 *   - asset_categories table (the structured tag store)
 *   - asset_brands join (for visually-confirmed vendors at confidence ≥ threshold)
 *
 * Strategy: wipes auto rows in asset_categories, preserves
 * operator/subscriber overrides. asset_brands union-inserts (doesn't
 * remove operator-added brands).
 */
export async function persistStage2(
  assetId: string,
  stage1: Stage1Result | null,
  stage2: Stage2Result,
): Promise<{ categoryRows: number; brandRows: number }> {
  // Persist the full artifact to asset_analysis JSONB
  const artifact = {
    stage1,
    stage2,
    generated_at: new Date().toISOString(),
    model_versions: {
      stage1: "claude-haiku-4-5-20251001",
      stage2: "claude-sonnet-4-6",
    },
    cost_estimate: {
      stage1_input_tokens: stage1?.cost.input_tokens ?? 0,
      stage1_output_tokens: stage1?.cost.output_tokens ?? 0,
      stage2_input_tokens: stage2.cost.input_tokens,
      stage2_output_tokens: stage2.cost.output_tokens,
    },
  };
  await sql`
    UPDATE media_assets
    SET asset_analysis = ${JSON.stringify(artifact)}::jsonb, updated_at = NOW()
    WHERE id = ${assetId}
  `;

  // Persist asset_categories — preserve operator/subscriber overrides
  const overrides = await sql`
    SELECT gcid, is_primary FROM asset_categories
    WHERE asset_id = ${assetId} AND assigned_by != 'auto'
  `;
  const overrideGcids = new Set(overrides.map((r) => r.gcid as string));
  const hasOverridePrimary = overrides.some((r) => r.is_primary === true);

  await sql`DELETE FROM asset_categories WHERE asset_id = ${assetId} AND assigned_by = 'auto'`;

  let categoryRows = 0;
  if (!overrideGcids.has(stage2.asset_categories.primary.gcid)) {
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${stage2.asset_categories.primary.gcid}, ${!hasOverridePrimary},
              ${stage2.asset_categories.primary.confidence}, 'auto',
              ${stage2.asset_categories.primary.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
    categoryRows++;
  }
  for (const s of stage2.asset_categories.secondaries) {
    if (overrideGcids.has(s.gcid)) continue;
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${s.gcid}, false, ${s.confidence}, 'auto', ${s.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
    categoryRows++;
  }

  // Persist asset_brands (union-insert visually-confirmed vendors at ≥0.75)
  let brandRows = 0;
  for (const v of stage2.detected_vendors) {
    if (v.confidence < 0.75) continue;
    // Look up brand by slug to get the brand_id
    const [brand] = await sql`SELECT id FROM brands WHERE slug = ${v.brand_slug} LIMIT 1`;
    if (!brand) continue;
    await sql`
      INSERT INTO asset_brands (asset_id, brand_id)
      VALUES (${assetId}, ${brand.id})
      ON CONFLICT DO NOTHING
    `;
    brandRows++;
  }

  return { categoryRows, brandRows };
}
