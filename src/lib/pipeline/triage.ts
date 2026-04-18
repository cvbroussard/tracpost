import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { AutopilotConfig, TriageResult, ContentPillar, PlatformFormat } from "./types";
import { buildPersonaPrompt, processDetections } from "@/lib/personas";
import type { PersonaDetection } from "@/lib/personas";

const anthropic = new Anthropic();

/**
 * Triage a media asset — evaluate quality, assign pillar, determine
 * platform fit, and set triage status.
 *
 * Uses Claude Vision for images and heuristic fallback for video.
 */
export async function triageAsset(assetId: string): Promise<TriageResult> {
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, context_note, transcription, metadata
    FROM media_assets
    WHERE id = ${assetId} AND triage_status = 'received'
  `;

  if (!asset) {
    throw new Error(`Asset ${assetId} not found or already triaged`);
  }

  // Fetch site config for thresholds
  const [site] = await sql`
    SELECT autopilot_config, content_pillars, pillar_config, brand_voice
    FROM sites
    WHERE id = ${asset.site_id}
  `;

  const config = (site?.autopilot_config || {}) as AutopilotConfig;
  const availablePillars = (site?.content_pillars || []) as ContentPillar[];
  const pillarConfig = (site?.pillar_config || []) as Array<{ id: string; label: string; description: string; tags: Array<{ id: string; label: string }> }>;

  // Use AI vision for images, heuristic for video
  let result: TriageResult;
  const mediaType = asset.media_type as string;

  // Build persona prompt if site has characters defined
  const personaPrompt = await buildPersonaPrompt(asset.site_id as string).catch(() => null);

  // Fetch site's brand list for auto-detection
  const brands = await sql`
    SELECT id, name, slug FROM brands
    WHERE site_id = ${asset.site_id}
  `;

  if (mediaType.startsWith("image") && asset.storage_url) {
    try {
      result = await visionTriage(asset, config, availablePillars, pillarConfig, site?.brand_voice, personaPrompt, brands);
    } catch (err: unknown) {
      console.error("Vision triage failed, falling back to heuristic:", err);
      result = heuristicTriage(asset, config, availablePillars);
    }
  } else {
    result = heuristicTriage(asset, config, availablePillars);
  }

  // Process persona detections from vision
  const detections = (result.ai_analysis?.detected_personas || []) as PersonaDetection[];
  if (detections.length > 0) {
    await processDetections(assetId, detections).catch((err) =>
      console.error("Persona detection processing failed:", err)
    );
  }

  // Persist triage result + generated text (merged into one vision call)
  const metadataUpdate = result.generated_text
    ? { generated_text: result.generated_text }
    : {};

  await sql`
    UPDATE media_assets
    SET
      triage_status = ${result.triage_status},
      quality_score = ${result.quality_score},
      content_pillar = ${result.content_pillar},
      content_pillars = ${result.content_pillars},
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
    await recalculateThresholds(asset.site_id as string);
  } catch { /* non-fatal */ }

  // Log triage in history
  await sql`
    INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
    VALUES (${asset.site_id}, 'triage', 'media_asset', ${assetId}, ${JSON.stringify({
      status: result.triage_status,
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
  personaPrompt?: string | null,
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
  const siteId = asset.site_id as string;
  let enrichedContext = "";
  try {
    const [siteExtra] = await sql`
      SELECT brand_playbook, location FROM sites WHERE id = ${siteId}
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
    const services = await sql`SELECT name FROM services WHERE site_id = ${siteId} ORDER BY display_order LIMIT 6`;
    if (services.length > 0) parts.push(`Services: ${services.map((s) => String(s.name)).join(", ")}`);
    const cats = await sql`
      SELECT gc.name, sgc.is_primary FROM site_gbp_categories sgc
      JOIN gbp_categories gc ON gc.gcid = sgc.gcid WHERE sgc.site_id = ${siteId}
    `;
    const primaryCat = cats.find((c) => c.is_primary);
    if (primaryCat) parts.push(`Business category: ${primaryCat.name}`);
    if (siteExtra?.location) parts.push(`Location: ${siteExtra.location}`);
    enrichedContext = parts.join("\n");
  } catch { /* non-fatal — text gen degrades gracefully */ }

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
${subscriberPillar ? `Subscriber suggested pillar: ${subscriberPillar}` : ""}
${pillarGuidance ? `## Content Pillars & Tags\n${pillarGuidance}\n` : `Available content pillars: ${pillarList}`}
${brandContext}
${brands && brands.length > 0 ? `\n## Known Vendors/Brands\nThe subscriber works with these vendors. If you recognize any of their products, materials, or equipment in the image, include them in detected_vendors.\n${brands.map((b) => `- ${b.name} (${b.slug})`).join("\n")}` : ""}
${enrichedContext ? `\n## Business Context (for text generation)\n${enrichedContext}` : ""}

Respond with ONLY valid JSON (no markdown):
{
  "quality_score": <0.0-1.0, see scoring guide below>,
  "content_pillars": [<1-3 matching pillar IDs from the pillars above, ordered by relevance>],
  "content_tags": [<2-5 matching tag IDs from the tags above, ordered by relevance>],
  "platform_fit": [<array of: "ig_feed", "ig_story", "ig_reel", "gbp", "youtube", "youtube_short", "fb_feed", "tiktok", "twitter", "linkedin", "pinterest">],
  "has_faces": <true/false — ONLY true if a human FACE is clearly visible (eyes, nose, mouth). Hands, arms, legs, torso, or humans seen from behind or waist-down do NOT count as faces>,
  "has_text_overlay": <true/false>,
  "description": "<1-sentence description of what's in the image>",
  "context_note": "<spec-style comma-separated list of specific materials, fixtures, vendors, techniques visible. Example: custom lacquer inset cabinets by Crystal Cabinet Works, Lacanche Sully range, zellige tile backsplash, rift-sawn white oak island. Only include what you can actually identify. No adjectives, no marketing language.>",
  "scene_type": "<one of: humans, environment, product, method, region — humans=people/animals visible, environment=space with no people, product=close-up of specific item/material, method=process/technique/craftsmanship shown, region=exterior/neighborhood/local context>",
  "quality_notes": "<brief note on quality issues if any>",
  "detected_vendors": [<array of vendor slugs from the known vendors list that appear in this image, e.g. ["lacanche", "crystal_cabinet_works"]>],
  "detected_personas": [{"persona_id": "<id>", "persona_name": "<name>", "confidence": <0.0-1.0>, "role": "subject"|"background", "reasoning": "<why>"}],
  "pin_headline": "<6-8 word Pinterest headline. Title case. Include one searchable keyword relevant to the business. Example: 'Custom Zellige Backsplash with Floating Shelves'>",
  "display_caption": "<1-2 sentence public-facing caption for the business website. Written in the brand's voice for their audience, not for the project owner.>",
  "alt_text": "<concise image alt text for screen readers. What is literally shown, no interpretation. Under 125 characters.>",
  "social_hook": "<scroll-stopping first line for social media. Creates curiosity or highlights the most interesting element. Under 15 words. No hashtags.>"
}

Rules:
- Photos are typically ig_feed, ig_story, gbp, fb_feed, twitter, linkedin, pinterest
- Vertical/portrait images also suit ig_story, tiktok, pinterest
- Only include ig_reel, youtube, or tiktok if the content is video or strongly suggests video would be better
- Professional/business content suits linkedin and gbp
- Visual/aesthetic content suits pinterest
- If subscriber provided a pillar, prefer it unless clearly wrong
- Quality scoring guide (technical publishability, NOT content value):
  0.9-1.0: Finished/completed work, good lighting, sharp, publishable as-is. Hero class.
  0.7-0.8: Decent composition but imperfect — in-progress work with good framing, minor lighting issues, some staging clutter.
  0.5-0.6: Rough but identifiable — poor lighting, construction debris visible, blurry areas, but the subject is clear.
  0.3-0.4: Very rough — dark, blurry, heavy clutter, hard to identify the subject.
  0.0-0.2: Unusable — accidental shot, completely dark, no discernible subject.
- Score based on whether the IMAGE can be published, not whether the subject matter is interesting.
${personaPrompt || 'If no known characters list is provided, return "detected_personas": []'}`,
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

  // Extract pillars from AI response (array) with fallback
  let contentPillars: ContentPillar[] = Array.isArray(parsed.content_pillars)
    ? parsed.content_pillars
    : parsed.content_pillar
      ? [parsed.content_pillar]
      : [pillars[0] || "general"];

  // Extract content tags (two-tier system)
  const contentTags: string[] = Array.isArray(parsed.content_tags)
    ? parsed.content_tags
    : [];

  // Apply subscriber pillar override if valid
  if (subscriberPillar) {
    if (!contentPillars.includes(subscriberPillar as ContentPillar)) {
      contentPillars.unshift(subscriberPillar as ContentPillar);
    }
  }

  const quality = Math.min(1, Math.max(0, parsed.quality_score || 0.5));
  const platformFit = (parsed.platform_fit || ["ig_feed", "ig_story", "gbp", "fb_feed", "twitter", "linkedin", "pinterest"]) as PlatformFormat[];

  // Determine triage outcome
  let triageStatus: TriageResult["triage_status"] = "triaged";
  let flagReason: string | undefined;
  let shelveReason: string | undefined;

  if (quality < (config.min_quality || 0.4)) {
    triageStatus = "shelved";
    shelveReason = `Quality score ${quality.toFixed(2)} below threshold ${config.min_quality || 0.4}`;
  }

  if (config.flag_faces && parsed.has_faces) {
    triageStatus = "flagged";
    flagReason = "Face detected in image — verify consent before publishing";
  }

  return {
    quality_score: Math.round(quality * 100) / 100,
    content_pillar: contentPillars[0],
    content_pillars: contentPillars,
    content_tags: contentTags,
    platform_fit: platformFit,
    triage_status: triageStatus,
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
      detected_personas: parsed.detected_personas || [],
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

  // Determine triage outcome
  let triageStatus: TriageResult["triage_status"] = "triaged";
  let flagReason: string | undefined;
  let shelveReason: string | undefined;

  if (quality < (config.min_quality || 0.4)) {
    triageStatus = "shelved";
    shelveReason = `Quality score ${quality.toFixed(2)} below threshold ${config.min_quality || 0.4}`;
  }

  if (config.flag_faces && /\b(face|person|people|kid|child|client)\b/i.test(contextNote)) {
    triageStatus = "flagged";
    flagReason = "Possible person/face detected in context note — verify consent";
  }

  return {
    quality_score: Math.round(quality * 100) / 100,
    content_pillar: pillar,
    content_pillars: [pillar],
    content_tags: [],
    platform_fit: platformFit,
    triage_status: triageStatus,
    flag_reason: flagReason,
    shelve_reason: shelveReason,
    ai_analysis: {
      engine: "heuristic-v1",
      media_type: mediaType,
      context_keywords: note.split(/\s+/).slice(0, 10),
    },
  };
}
