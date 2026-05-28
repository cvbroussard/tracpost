import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { AutopilotConfig, TriageResult, ContentPillar, PlatformFormat } from "./types";
import { SCENE_TYPE_IDS } from "@/lib/scene-types";
// Personas retired 2026-05-19 (full entity removal). The cascade no
// longer extracts, matches, or binds persons. See discussion: privacy
// posture says identity attribution lives in the transcript verbatim,
// not in a structured entity. Brand auto-binding remains (brands earn
// their entity status via enrichable metadata; personas don't).

const anthropic = new Anthropic();

/**
 * Sanitize an AI-generated URL slug. Returns null when the input is
 * unusable (empty, too short, or no recoverable content).
 *
 * Steps: lowercase → strip non-alphanumeric/hyphens → collapse multiple
 * hyphens → trim leading/trailing hyphens → cap at 80 chars without
 * cutting mid-word.
 *
 * Per the rename architecture (LOCKED 2026-05-08): the AI returns
 * `url_slug` based on subscriber's full briefing context + visual
 * analysis. We sanitize defensively because LLM output isn't guaranteed
 * to be URL-safe.
 */
function sanitizeSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.toLowerCase().trim();
  // Replace any non-alphanumeric run with a single hyphen
  s = s.replace(/[^a-z0-9]+/g, "-");
  // Trim leading/trailing hyphens
  s = s.replace(/^-+|-+$/g, "");
  if (s.length < 5) return null;
  // Cap at 80 chars, but don't cut mid-word — find the last hyphen before 80
  if (s.length > 80) {
    const lastHyphen = s.lastIndexOf("-", 80);
    s = lastHyphen > 40 ? s.slice(0, lastHyphen) : s.slice(0, 80);
  }
  return s;
}

/**
 * DEPRECATED 2026-05-16 — RETIRED, throws on call.
 *
 * Legacy briefing-time triage. Replaced by the merged cascade
 * (src/lib/categorization/cascade-analyze.ts orchestrating ner-extract
 * + vision-analyze) invoked via POST /api/assets/[id]/categorize/preview
 * + commit.
 *
 * Specifically retired because this function fed the brand catalog into
 * the vision prompt and asked for `detected_vendors` — pattern that
 * hallucinated brand matches ("Montigo 12%" canary on B² Shadyside
 * parlor, 2026-05-16). Brand attribution now lives in cascade-commit
 * via brand-match.ts (NER → Levenshtein → catalog, no vision priming).
 *
 * Body throws so any caller that still slips in fails loudly. The rest
 * of the file (sanitizeSlug, visionTriage, heuristic helpers) stays as
 * archive material — DO NOT call from new code.
 *
 * Known callers when retired:
 *   - src/app/api/pipeline/cron/route.ts.disabled (route already 404)
 *   - any operator ad-hoc invocation via the same disabled route
 */
export async function triageAsset(_assetId: string): Promise<TriageResult> {
  throw new Error(
    "DEPRECATED 2026-05-16: triageAsset is retired. Use the cascade " +
      "(POST /api/assets/[id]/categorize/preview + commit). The old vision " +
      "prompt fed the brand catalog into the LLM and produced hallucinated " +
      "vendor matches. brand-match.ts owns brand attribution now via Stage 1 NER. " +
      "Old implementation is in git history (pre-2026-05-16).",
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _archivedTriageAssetBody(assetId: string): Promise<TriageResult> {
  const [asset] = await sql`
    SELECT id, business_id, storage_url, media_type, context_note, transcription, metadata, poster_asset_id
    FROM media_assets
    WHERE id = ${assetId} AND processing_stage = 'onboarded'
  `;

  if (!asset) {
    throw new Error(`Asset ${assetId} not found or not in onboarded state`);
  }

  // Fetch site config for thresholds
  const [site] = await sql`
    SELECT autopilot_config, content_pillars, pillar_config, brand_voice
    FROM businesses
    WHERE id = ${asset.business_id}
  `;

  const config = (site?.autopilot_config || {}) as AutopilotConfig;
  const availablePillars = (site?.content_pillars || []) as ContentPillar[];
  const pillarConfig = (site?.pillar_config || []) as Array<{ id: string; label: string; description: string; tags: Array<{ id: string; label: string }> }>;

  // Use AI vision for images. For videos, use the auto-generated poster
  // image (per design lock 2026-05-08 — every video upload gets a poster
  // extracted at the 1s mark via generatePosterForAsset). If poster
  // generation hasn't completed yet OR failed, fall through to heuristic.
  let result: TriageResult;
  const mediaType = asset.media_type as string;

  // Fetch site's brand list for auto-detection
  const brands = await sql`
    SELECT id, name, slug FROM brands
    WHERE business_id = ${asset.business_id}
  `;

  // Resolve the URL we'll feed into vision: image source uses its own URL,
  // video source uses its poster's URL (when available).
  let visionUrl: string | null = null;
  if (mediaType.startsWith("image") && asset.storage_url) {
    visionUrl = asset.storage_url as string;
  } else if (mediaType.toLowerCase().startsWith("video") && asset.poster_asset_id) {
    const [poster] = await sql`
      SELECT storage_url FROM media_assets WHERE id = ${asset.poster_asset_id}
    `;
    if (poster?.storage_url) {
      visionUrl = poster.storage_url as string;
    }
  }

  if (visionUrl) {
    // Pass the vision URL via a shallow clone of asset so visionTriage
    // analyzes the right image without coupling to the poster lookup.
    const visionAsset = { ...asset, storage_url: visionUrl };
    try {
      result = await visionTriage(visionAsset, config, availablePillars, pillarConfig, site?.brand_voice, brands);
    } catch (err: unknown) {
      console.error("Vision triage failed, falling back to heuristic:", err);
      result = heuristicTriage(asset, config, availablePillars);
    }
  } else {
    result = heuristicTriage(asset, config, availablePillars);
  }

  // Persona detection retired 2026-05-19. Vision pass no longer
  // produces detected_personas (prompt cleaned up below); even if it
  // did, the entity layer is gone.

  // Persist triage result + generated text (merged into one vision call)
  const metadataUpdate = result.generated_text
    ? { generated_text: result.generated_text }
    : {};

  // content_pillar / content_pillars columns intentionally NOT written
  // here (LOCKED 2026-05-09). Pillars are NOT stored on the asset — they
  // derive from content_tags + sites.pillar_config at read time via
  // pillarsFromTags(). Triage's job ends at writing the canonical signals:
  // tags, scene types, AI analysis. Downstream consumers (orchestrator,
  // gbp, content-matcher) migrating to derive in task #181.
  await sql`
    UPDATE media_assets
    SET
      processing_stage = ${result.processing_stage},
      quality_score = ${result.quality_score},
      scene_types = COALESCE(${result.scene_types || null}, scene_types),
      content_tags = ${result.content_tags || []},
      platform_fit = ${result.platform_fit},
      flag_reason = ${result.flag_reason || null},
      shelve_reason = ${result.shelve_reason || null},
      ai_analysis = ${JSON.stringify(result.ai_analysis)},
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadataUpdate)}::jsonb,
      triaged_at = NOW()
    WHERE id = ${assetId}
  `;

  // Seed context_note if tenant didn't provide one at upload.
  // Uses the spec-style context_note from AI analysis (raw descriptors).
  // Preserves mobile app captions — only writes if field is NULL.
  const autoContext = result.ai_analysis?.context_note as string | undefined;
  if (autoContext && !(asset.context_note as string)) {
    await sql`
      UPDATE media_assets
      SET context_note = ${autoContext},
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"context_auto_generated": true}'::jsonb
      WHERE id = ${assetId} AND context_note IS NULL
    `;
  }

  // Recalculate site-relative quality thresholds
  try {
    const { recalculateThresholds } = await import("./quality-thresholds");
    await recalculateThresholds(asset.business_id as string);
  } catch { /* non-fatal */ }

  // Log triage in history
  await sql`
    INSERT INTO subscriber_actions (business_id, action_type, target_type, target_id, payload)
    VALUES (${asset.business_id}, 'triage', 'media_asset', ${assetId}, ${JSON.stringify({
      status: result.processing_stage,
      quality_score: result.quality_score,
      pillar: result.content_pillar,
      engine: result.ai_analysis?.engine || "unknown",
    })})
  `;

  // Auto-detect and associate vendors from the image
  const detectedVendors = result.ai_analysis?.detected_vendors as string[] | undefined;
  if (detectedVendors && detectedVendors.length > 0 && brands.length > 0) {
    for (const slug of detectedVendors) {
      const brand = brands.find((b) => b.slug === slug);
      if (brand) {
        await sql`
          INSERT INTO asset_brands (asset_id, brand_id)
          VALUES (${assetId}, ${brand.id})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  // Enhancement is just-in-time, not at upload.
  // Photos sit raw in the reservoir. Enhancement happens when the
  // autopilot selects an asset for content generation.

  return result;
}

/**
 * AI Vision triage — uses Claude to analyze image quality, content,
 * and classify into pillar/platform fit.
 */
async function visionTriage(
  asset: Record<string, unknown>,
  config: AutopilotConfig,
  pillars: ContentPillar[],
  pillarConfig?: Array<{ id: string; label: string; description: string; tags: Array<{ id: string; label: string }> }>,
  brandVoice?: unknown,
  brands?: Array<Record<string, unknown>>
): Promise<TriageResult> {
  const contextNote = (asset.context_note as string) || "";
  const metadata = (asset.metadata || {}) as Record<string, unknown>;
  const subscriberPillar = (metadata.pillar as string) || "";
  const storageUrl = asset.storage_url as string;

  const pillarList = pillars.length > 0 ? pillars.join(", ") : "general";

  // Build two-tier pillar guidance if available
  const pillarGuidance = pillarConfig && pillarConfig.length > 0
    ? pillarConfig.map((p) => {
        const tagList = p.tags.map((t) => `${t.id} (${t.label})`).join(", ");
        return `**${p.id}** (${p.label}): ${p.description}\n  Tags: ${tagList}`;
      }).join("\n\n")
    : "";

  const brandContext = brandVoice
    ? `Brand context: ${JSON.stringify(brandVoice)}`
    : "";

  // Load enriched context for text generation (playbook, services, GBP)
  const siteId = asset.business_id as string;
  let enrichedContext = "";
  try {
    const [siteExtra] = await sql`
      SELECT brand_playbook, location FROM businesses WHERE id = ${siteId}
    `;
    const parts: string[] = [];
    const playbook = (siteExtra?.brand_playbook || {}) as Record<string, unknown>;
    const positioning = (playbook.brandPositioning || {}) as Record<string, unknown>;
    const angles = (positioning.selectedAngles || []) as Array<Record<string, unknown>>;
    const offerCore = (playbook.offerCore || {}) as Record<string, unknown>;
    if (angles[0]?.tagline) parts.push(`Brand tagline: ${angles[0].tagline}`);
    if (angles[0]?.tone) parts.push(`Brand tone: ${angles[0].tone}`);
    if (offerCore.offerStatement) {
      const stmt = offerCore.offerStatement as Record<string, unknown>;
      if (stmt.finalStatement) parts.push(`Brand promise: ${stmt.finalStatement}`);
    }
    const services = await sql`SELECT name FROM services WHERE business_id = ${siteId} ORDER BY display_order LIMIT 6`;
    if (services.length > 0) parts.push(`Services: ${services.map((s) => String(s.name)).join(", ")}`);
    const cats = await sql`
      SELECT gc.name, sgc.is_primary FROM business_gbp_categories sgc
      JOIN gbp_categories gc ON gc.gcid = sgc.gcid WHERE sgc.business_id = ${siteId}
    `;
    const primaryCat = cats.find((c) => c.is_primary);
    if (primaryCat) parts.push(`Business category: ${primaryCat.name}`);
    if (siteExtra?.location) parts.push(`Location: ${siteExtra.location}`);
    enrichedContext = parts.join("\n");
  } catch { /* non-fatal — text gen degrades gracefully */ }

  // Load content corrections for prompt injection
  let correctionsBlock = "";
  try {
    const { loadCorrections, formatCorrectionsForPrompt } = await import("@/lib/corrections");
    const corrections = await loadCorrections(asset.business_id as string, "social");
    correctionsBlock = formatCorrectionsForPrompt(corrections);
  } catch { /* non-fatal */ }

  // Download image, convert HEIC if needed, encode as base64
  const { fetchAndConvert } = await import("@/lib/image-utils");
  const { data: imgBuffer, mimeType: imgMimeType } = await fetchAndConvert(storageUrl);
  const imgBase64 = imgBuffer.toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: imgMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imgBase64 },
          },
          {
            type: "text",
            text: `Analyze this image for a social media content pipeline.

Context note from subscriber: "${contextNote}"
${pillarGuidance ? `## Content Pillars & Tags\n${pillarGuidance}\n` : `Available content pillars: ${pillarList}`}
${brandContext}
${brands && brands.length > 0 ? `\n## Known Vendors/Brands\nThe subscriber works with these vendors. If you recognize any of their products, materials, or equipment in the image, include them in detected_vendors.\n${brands.map((b) => `- ${b.name} (${b.slug})`).join("\n")}` : ""}
${enrichedContext ? `\n## Business Context (for text generation)\n${enrichedContext}` : ""}
${correctionsBlock}
## Tag selection (read carefully)
Pillars are NOT what you're picking — they're just the grouping context shown above.
Your job is to pick the best 2-5 TAGS that fit this asset, drawn from across the
entire pillar menu (you can mix tags from multiple pillars; pillar membership is
derived later from which tags you chose). Do NOT return a content_pillar field —
the parser computes pillars from tags.

Respond with ONLY valid JSON (no markdown):
{
  "quality_score": <0.0-1.0, see scoring guide below>,
  "content_tags": [<2-5 matching tag IDs from the tags above, ordered by relevance>],
  "platform_fit": [<array of: "ig_feed", "ig_story", "ig_reel", "gbp", "youtube", "youtube_short", "fb_feed", "tiktok", "twitter", "linkedin", "pinterest">],
  "has_faces": <true/false — ONLY true if a human FACE is clearly visible (eyes, nose, mouth). Hands, arms, legs, torso, or humans seen from behind or waist-down do NOT count as faces>,
  "has_text_overlay": <true/false>,
  "description": "<1-sentence description of what's in the image>",
  "context_note": "<spec-style comma-separated list of specific materials, fixtures, vendors, techniques visible. Example: custom lacquer inset cabinets by Crystal Cabinet Works, Lacanche Sully range, zellige tile backsplash, rift-sawn white oak island. Only include what you can actually identify. No adjectives, no marketing language.>",
  "scene_types": [<array of matching IDs from this fixed vocabulary — pick all that apply (1 to many): "wide_shot" (whole space/subject in frame), "close_up" (detail of material/finish/feature), "in_progress" (active work mid-task), "people" (humans visible), "before" (pre-work/starting state), "after" (completed result), "documentation" (plans/diagrams/sketches/screenshots), "lifestyle" (finished space being lived in/used). Examples: ["wide_shot","after"] for a finished kitchen reveal; ["in_progress","people"] for a crew working; ["close_up","after"] for a finished detail shot.>],
  "quality_notes": "<brief note on quality issues if any>",
  "detected_vendors": [<array of vendor slugs from the known vendors list that appear in this image, e.g. ["lacanche", "crystal_cabinet_works"]>],
  "pin_headline": "<6-8 word Pinterest headline. Title case. Include one searchable keyword relevant to the business. Example: 'Custom Zellige Backsplash with Floating Shelves'>",
  "display_caption": "<1-2 sentence public-facing caption for the business website. Written in the brand's voice for their audience, not for the project owner.>",
  "alt_text": "<concise image alt text for screen readers. What is literally shown, no interpretation. Under 125 characters.>",
  "social_hook": "<scroll-stopping first line for social media. Creates curiosity or highlights the most interesting element. Under 15 words. No hashtags.>",
  "url_slug": "<3-7 hyphen-separated lowercase keywords (40-80 chars total) that capture the most distinguishing concepts in this asset for SEO. Combine subscriber's strategic intent (from context note + pillar + brands + project) with what's visually distinctive. Examples: 'walked-through-carter-foundation-underpinning', 'kitchen-reveal-brizo-faucet-walnut-cabinets', 'demo-day-knob-and-tube-discovery'. No filler words ('the', 'a', 'an'). No repeating keywords. lowercase, alphanumeric and hyphens only.>"
}

Rules:
- Photos are typically ig_feed, ig_story, gbp, fb_feed, twitter, linkedin, pinterest
- Vertical/portrait images also suit ig_story, tiktok, pinterest
- Only include ig_reel, youtube, or tiktok if the content is video or strongly suggests video would be better
- Professional/business content suits linkedin and gbp
- Visual/aesthetic content suits pinterest
- Quality scoring guide (technical publishability, NOT content value):
  0.9-1.0: Finished/completed work, good lighting, sharp, publishable as-is. Hero class.
  0.7-0.8: Decent composition but imperfect — in-progress work with good framing, minor lighting issues, some staging clutter.
  0.5-0.6: Rough but identifiable — poor lighting, construction debris visible, blurry areas, but the subject is clear.
  0.3-0.4: Very rough — dark, blurry, heavy clutter, hard to identify the subject.
  0.0-0.2: Unusable — accidental shot, completely dark, no discernible subject.
- Score based on whether the IMAGE can be published, not whether the subject matter is interesting.`,
          },
        ],
      },
    ],
  });

  // Parse response — strip markdown fencing if present
  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = rawText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in vision response");
  const parsed = JSON.parse(jsonMatch[0]);

  // Extract content tags — the canonical AI signal (LOCKED 2026-05-09).
  // Pillars are NO LONGER asked of the AI; they're derived from tag→parent
  // lookup in pillarConfig. Defensive filter: only keep tag IDs that
  // actually exist in pillarConfig (AI can hallucinate IDs).
  const allValidTagIds = new Set((pillarConfig || []).flatMap((p) => p.tags.map((t) => t.id)));
  const contentTags: string[] = Array.isArray(parsed.content_tags)
    ? (parsed.content_tags as string[]).filter((id) => allValidTagIds.has(id))
    : [];

  // Derive content_pillars from selected tags — find parent pillar for each
  // tag, dedupe. content_pillar singular = pillars[0] (back-compat shadow).
  // If AI returned no usable tags AND legacy content_pillar field is present,
  // fall back to that for grace; otherwise default to first available pillar.
  let contentPillars: ContentPillar[] = Array.from(
    new Set(
      contentTags
        .map((tagId) => (pillarConfig || []).find((p) => p.tags.some((t) => t.id === tagId))?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ) as ContentPillar[];
  if (contentPillars.length === 0) {
    // Legacy fallback only — AI shouldn't return content_pillar anymore
    if (parsed.content_pillar) contentPillars = [parsed.content_pillar];
    else contentPillars = [pillars[0] || "general"];
  }
  // Apply subscriber pillar override if valid (legacy path — kept for
  // backward compat; new architecture has subscriber editing tags directly,
  // which already implies the pillar).
  if (subscriberPillar && !contentPillars.includes(subscriberPillar as ContentPillar)) {
    contentPillars.unshift(subscriberPillar as ContentPillar);
  }

  const quality = Math.min(1, Math.max(0, parsed.quality_score || 0.5));
  const platformFit = (parsed.platform_fit || ["ig_feed", "ig_story", "gbp", "fb_feed", "twitter", "linkedin", "pinterest"]) as PlatformFormat[];

  // Scene composition: filter AI response to known IDs (defensive — AI can
  // hallucinate). Fall back to legacy single-string scene_type via mapping
  // only if AI returns nothing for the new array field.
  const rawSceneTypes = Array.isArray(parsed.scene_types)
    ? (parsed.scene_types as string[])
    : [];
  const sceneTypes = rawSceneTypes.filter((s) => SCENE_TYPE_IDS.includes(s));

  // Determine triage outcome.
  // Per the briefing-required principle (migrate-099): default is
  // 'onboarded' — AI triage enriches metadata but never auto-
  // promotes state to 'briefed'. Only human briefing flips to 'briefed'.
  // DEAD CODE — this function is unreachable (triageAsset throws
  // DEPRECATED). Literal updated only to satisfy the new ProcessingStage
  // enum; the value is never used at runtime.
  let processingStage: TriageResult["processing_stage"] = "onboarded";
  let flagReason: string | undefined;
  let shelveReason: string | undefined;

  if (quality < (config.min_quality || 0.4)) {
    processingStage = "onboarded";
    shelveReason = `Quality score ${quality.toFixed(2)} below threshold ${config.min_quality || 0.4}`;
  }

  if (config.flag_faces && parsed.has_faces) {
    processingStage = "onboarded";
    flagReason = "Face detected in image — verify consent before publishing";
  }

  return {
    quality_score: Math.round(quality * 100) / 100,
    content_pillar: contentPillars[0],
    content_pillars: contentPillars,
    scene_types: sceneTypes,
    content_tags: contentTags,
    platform_fit: platformFit,
    processing_stage: processingStage,
    flag_reason: flagReason,
    shelve_reason: shelveReason,
    ai_analysis: {
      engine: "claude-vision-v1",
      description: parsed.description,
      context_note: parsed.context_note || null,
      scene_type: parsed.scene_type || null,
      quality_notes: parsed.quality_notes,
      has_faces: parsed.has_faces,
      has_text_overlay: parsed.has_text_overlay,
      detected_vendors: parsed.detected_vendors || [],
      // SEO-shaped slug derived from full briefing context + visual
      // analysis. Used by the source-rename pipeline (next commit) to
      // generate pretty URLs for source asset + variant + poster keys.
      // Sanitized to lowercase alphanumeric + hyphens, max 80 chars.
      url_slug: sanitizeSlug(parsed.url_slug),
    },
    generated_text: (parsed.pin_headline || parsed.display_caption) ? {
      context_note: parsed.context_note || parsed.description || "",
      pin_headline: parsed.pin_headline || "",
      display_caption: parsed.display_caption || "",
      alt_text: parsed.alt_text || "",
      social_hook: parsed.social_hook || "",
      generated_at: new Date().toISOString(),
    } : undefined,
  };
}

/**
 * Heuristic triage — fallback for video or when vision API fails.
 */
function heuristicTriage(
  asset: Record<string, unknown>,
  config: AutopilotConfig,
  pillars: ContentPillar[]
): TriageResult {
  const mediaType = asset.media_type as string;
  const contextNote = (asset.context_note as string) || "";
  const metadata = (asset.metadata || {}) as Record<string, unknown>;

  // Base quality — videos get a slight boost (more engaging)
  let quality = mediaType.startsWith("video") ? 0.65 : 0.55;

  // Context note present = subscriber cared enough to annotate
  if (contextNote.length > 10) quality += 0.1;

  // High-res metadata boost
  const width = (metadata.width as number) || 0;
  if (width >= 1080) quality += 0.1;
  if (width >= 1920) quality += 0.05;

  // Clamp to [0, 1]
  quality = Math.min(1, Math.max(0, quality));

  // Platform fit based on media type
  const platformFit: PlatformFormat[] = [];
  if (mediaType.startsWith("video")) {
    platformFit.push("ig_reel", "ig_story", "youtube_short", "tiktok", "fb_reel");
    const duration = (metadata.duration_seconds as number) || 0;
    if (duration > 60) platformFit.push("youtube");
  } else if (mediaType.startsWith("image")) {
    platformFit.push("ig_feed", "ig_story", "gbp", "fb_feed", "twitter", "linkedin", "pinterest");
  }

  // Pillar assignment — subscriber-provided pillar takes precedence
  let pillar: ContentPillar = pillars[0] || "training_action";
  const subscriberPillar = (metadata.pillar as string) || "";
  const note = contextNote.toLowerCase();

  if (subscriberPillar && pillars.includes(subscriberPillar as ContentPillar)) {
    pillar = subscriberPillar as ContentPillar;
  } else if (note.includes("before") || note.includes("after") || note.includes("result")) {
    pillar = "result";
  } else if (note.includes("hektor") || note.includes("showcase") || note.includes("demo")) {
    pillar = "showcase";
  } else if (note.includes("tip") || note.includes("how") || note.includes("explain")) {
    pillar = "educational";
  } else if (note.includes("session") || note.includes("training") || note.includes("drill")) {
    pillar = "training_action";
  }

  // Determine triage outcome — default 'onboarded' per
  // briefing-required principle (migrate-099). Heuristic mirrors the
  // vision-triage logic above.
  // DEAD CODE — this function is unreachable (triageAsset throws
  // DEPRECATED). Literal updated only to satisfy the new ProcessingStage
  // enum; the value is never used at runtime.
  let processingStage: TriageResult["processing_stage"] = "onboarded";
  let flagReason: string | undefined;
  let shelveReason: string | undefined;

  if (quality < (config.min_quality || 0.4)) {
    processingStage = "onboarded";
    shelveReason = `Quality score ${quality.toFixed(2)} below threshold ${config.min_quality || 0.4}`;
  }

  if (config.flag_faces && /\b(face|person|people|kid|child|client)\b/i.test(contextNote)) {
    processingStage = "onboarded";
    flagReason = "Possible person/face detected in context note — verify consent";
  }

  return {
    quality_score: Math.round(quality * 100) / 100,
    content_pillar: pillar,
    content_pillars: [pillar],
    scene_types: [],  // heuristic can't infer composition — leave empty for subscriber to set
    content_tags: [],
    platform_fit: platformFit,
    processing_stage: processingStage,
    flag_reason: flagReason,
    shelve_reason: shelveReason,
    ai_analysis: {
      engine: "heuristic-v1",
      media_type: mediaType,
      context_keywords: note.split(/\s+/).slice(0, 10),
    },
  };
}
