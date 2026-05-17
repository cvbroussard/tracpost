/**
 * Vision analysis pass — multimodal Sonnet call. Internal helper called
 * by cascade-analyze.ts.
 *
 * Sonnet 4.6 vision (~$0.02, ~3-5s). Receives the image + transcript +
 * NER entities (pre-extracted by the prior NER pass) + the site's
 * declared GBP categories + pillar config. Produces the multimodal
 * artifact: categories, scene types, slug, story angles, suggested
 * pillar, caption hints.
 *
 * Brand vendor detection was REMOVED 2026-05-16 because feeding the
 * brand catalog into the prompt caused hallucinations ("Montigo 12%"
 * canary). Brand attribution lives in cascade-commit via brand-match.ts
 * (NER → Levenshtein → catalog).
 *
 * Universal rule: array outputs are salience/confidence-ranked.
 * Position [0] is the top. No separate primary_X fields except for
 * asset_categories.primary which has special DB semantics.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SCENE_TYPES, SCENE_TYPE_IDS } from "@/lib/scene-types";
import type { NerResult } from "./ner-extract";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AssetCategoryAssignment {
  gcid: string;
  name: string;
  confidence: number;
  reasoning: string;
}

export interface AssetCategoryCollection {
  primary: AssetCategoryAssignment;
  secondaries: AssetCategoryAssignment[];
  allRanked: AssetCategoryAssignment[];
}

export interface CaptionHints {
  tone: string;
  voice_anchor: string;
  key_phrases_to_use: string[];
  phrases_to_avoid: string[];
  audience: string;
  lead_with: string;
}

export interface VisionResult {
  asset_categories: AssetCategoryCollection;
  scene_types: string[];
  url_slug: string;
  story_angles: string[];
  suggested_pillar: string | null;
  caption_hints: CaptionHints;
  cost: { input_tokens: number; output_tokens: number };
}

export type VisionOutcome =
  | { status: "success"; result: VisionResult }
  | { status: "skipped"; reason: "no_site_categories" | "no_image" }
  | { status: "error"; error: string };

export interface PillarConfigEntry {
  id: string;
  label: string;
  description?: string;
  tags: Array<{ id: string; label: string; description?: string }>;
}

export interface VisionInput {
  assetId: string;
  imageUrl: string;
  transcript: string;
  ner: NerResult | null;
  siteCategories: Array<{ gcid: string; name: string }>;
  brandDnaDigest: string | null;
  pillarConfig: PillarConfigEntry[];
}

export const VISION_MODEL = "claude-sonnet-4-6";

function buildSystemPrompt(): string {
  return `You are TracPost's multimodal asset analyzer. Given an asset image (or video poster) + the subscriber's transcript + pre-extracted entities + the site's declared GBP categories + brand DNA hints, produce ONE canonical analysis artifact in strict JSON.

The pre-extracted entities (brands, projects, specialties, locations, materials) were already pulled from the transcript by a prior NER pass. Your job is to add the visual + multimodal reasoning that text alone can't provide.

You are NOT responsible for detecting brands or vendors. The transcript-based NER is the canonical brand signal; the commit step matches those NER hits against the site's brand catalog. Do not output brand information.

OUTPUTS (all required):

1. **asset_categories** — Classify the asset into the site's declared GBP categories.
   - primary: the single best match (always assigned, even at low confidence)
   - secondaries: 0-2 additional categories, ONLY at confidence ≥0.85 AND only if the asset genuinely spans multiple categories
   - allRanked: ALL site categories sorted by confidence descending (for inspector/debug)
   - Each entry: { gcid, confidence (0..1), reasoning (cite transcript + visual evidence) }
   - NEVER invent gcids — only use ones from the site's category list provided

2. **scene_types** — From the fixed taxonomy provided in the user message, pick any/all that strictly match the operator's canonical description (NOT your default interpretation of the slug name). Each scene type has a specific definition — match against the description text, not what the slug "sounds like" in general photography vocabulary. Return as salience-ranked array (position [0] = most prominent). The taxonomy is cross-cutting (an asset can legitimately be multiple), do not arbitrarily limit count. But do not over-apply — if the description doesn't fit, leave it out.

3. **url_slug** — SEO-friendly kebab-case slug (~6-10 words) anchored in the most distinctive content of the asset. Include project name if present, primary visual feature, location if relevant. Example: "shadyside-parlor-walnut-cabinetry-restoration".

4. **story_angles** — Tag IDs drawn from the site's pillar_config taxonomy (provided in user message). These are the per-asset labels that say "this asset expresses these specific angles within these pillars." NEVER invent tag IDs — only use exact IDs from the pillar_config provided. NEVER use a free-form snake_case string the LLM made up. Salience-ranked (position [0] = strongest fit). Cap at 3-5 tags max. Each chosen tag must have evidence in transcript OR specific visual feature — don't add tags that don't have direct support. Tags can span multiple pillars (asset can express both PROOF and EDUCATION angles, for instance). Return empty array if no tags fit confidently.

5. **suggested_pillar** — Single pillar ID from the site's pillar_config (the PRIMARY strategic grouping this asset slots into). If story_angles span multiple pillars, pick the pillar with the most/strongest matched tags. If none clearly applies, return null.

6. **caption_hints** — Guidance for downstream caption generator (NOT the caption itself):
   - tone: short phrase describing voice ("confident, technical, craftsmanship-forward")
   - voice_anchor: a specific phrase from the transcript that captures the subscriber's voice
   - key_phrases_to_use: 2-5 specific terms from transcript that should appear in the caption
   - phrases_to_avoid: optional, things that don't fit the brand voice
   - audience: who this caption is FOR ("homeowners seeking high-end historic restoration")
   - lead_with: what the first line of the caption should emphasize

CRITICAL RULES:

- **TRANSCRIPT IS PRIMARY SIGNAL.** When transcript and image conflict, weight transcript higher.
- **NEVER INVENT.** Only use gcids from site's category list. Only use scene_types from the fixed taxonomy. Only use pillars from site's options. Only use tag IDs from the pillar_config.
- **CITE EVIDENCE.** Every reasoning field should reference specific transcript phrases AND specific visual features.
- **RANK BY SALIENCE.** All array outputs descending by relevance/confidence. Position [0] is the top.

OUTPUT: Return ONLY a JSON object matching the spec. No prose, no markdown code fences. Strict JSON.`;
}

function buildUserMessage(input: VisionInput): string {
  const lines: string[] = [];

  lines.push("=== ASSET TRANSCRIPT ===\n");
  lines.push(input.transcript.trim());
  lines.push("");

  if (input.ner) {
    lines.push("=== PRE-EXTRACTED ENTITIES (from prior NER pass) ===\n");
    const e = input.ner.entities;
    if (e.brands.length) lines.push(`Brands mentioned: ${e.brands.map((b) => b.text).join(", ")}`);
    if (e.projects.length) lines.push(`Projects mentioned: ${e.projects.map((p) => p.text).join(", ")}`);
    if (e.specialties.length) lines.push(`Specialties / work themes: ${e.specialties.map((s) => s.text).join(", ")}`);
    if (e.locations.length) lines.push(`Locations: ${e.locations.map((l) => `${l.text} (${l.type})`).join(", ")}`);
    if (e.materials.length) lines.push(`Materials: ${e.materials.map((m) => m.text).join(", ")}`);
    if (input.ner.suggested_tags.length) lines.push(`NER suggested tags: ${input.ner.suggested_tags.join(", ")}`);
    lines.push("");
  }

  lines.push("=== SITE'S DECLARED GBP CATEGORIES (pick asset_categories from these) ===\n");
  for (const c of input.siteCategories) {
    lines.push(`  ${c.gcid}  →  ${c.name}`);
  }
  lines.push("");

  lines.push("=== ALLOWED SCENE_TYPES (match against the description, not just the slug name) ===\n");
  for (const t of SCENE_TYPES) {
    lines.push(`  ${t.id} — ${t.description}`);
  }
  lines.push("");

  if (input.pillarConfig.length > 0) {
    lines.push("=== SITE'S PILLAR_CONFIG (suggested_pillar = ONE pillar id; story_angles = tag IDs from these pillars) ===\n");
    lines.push("Pillars are strategic content groupings (PROOF, EDUCATION, etc. — what content DOES rhetorically).");
    lines.push("Tags within each pillar are the specific angles. story_angles output MUST be tag IDs drawn from this list (NEVER invented).\n");
    for (const p of input.pillarConfig) {
      lines.push(`PILLAR: ${p.id}${p.label ? `  (${p.label})` : ""}${p.description ? ` — ${p.description}` : ""}`);
      if (p.tags && p.tags.length > 0) {
        for (const t of p.tags) {
          lines.push(`  ${t.id}${t.label ? `  →  ${t.label}` : ""}${t.description ? ` — ${t.description}` : ""}`);
        }
      } else {
        lines.push(`  (no tags configured for this pillar)`);
      }
      lines.push("");
    }
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

export async function analyzeVision(input: VisionInput): Promise<VisionOutcome> {
  if (input.siteCategories.length === 0) return { status: "skipped", reason: "no_site_categories" };
  if (!input.imageUrl) return { status: "skipped", reason: "no_image" };

  try {
    const { data, mediaType } = await fetchImageBase64(input.imageUrl);

    const res = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 3000,
      // Vision is interpretive — categories, scene_types, story
      // angles, slug, caption_hints. Default temp=1.0 produced
      // significant run-to-run drift on stable inputs (subscribers
      // re-analyzing saw slug/category churn). Drop to 0.3 — enough
      // creative latitude on phrasing without rotating the
      // load-bearing fields. Still NOT seeded; some variance remains.
      temperature: 0.3,
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

    // Validate gcids against site catalog
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

    const validScenes = new Set(SCENE_TYPE_IDS);
    const sceneTypes = (parsed.scene_types || []).filter((s) => validScenes.has(s));

    const validPillars = new Set(input.pillarConfig.map((p) => p.id));
    const suggestedPillar = parsed.suggested_pillar && validPillars.has(parsed.suggested_pillar)
      ? parsed.suggested_pillar
      : null;

    const validTagIds = new Set<string>();
    for (const p of input.pillarConfig) {
      for (const t of p.tags || []) validTagIds.add(t.id);
    }
    const validStoryAngles = (parsed.story_angles || []).filter((t) => validTagIds.has(t));

    const result: VisionResult = {
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
      url_slug: parsed.url_slug || "",
      story_angles: validStoryAngles,
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
