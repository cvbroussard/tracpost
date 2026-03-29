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

  if (mediaType.startsWith("image") && asset.storage_url) {
    try {
      result = await visionTriage(asset, config, availablePillars, pillarConfig, site?.brand_voice, personaPrompt);
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

  // Persist triage result
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
      triaged_at = NOW()
    WHERE id = ${assetId}
  `;

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

  // Auto-enhance triaged images
  if (result.triage_status === "triaged" && (asset.media_type as string) === "image") {
    try {
      const { enhanceAssetPhoto } = await import("@/lib/image-gen/enhance");
      const enhancedUrl = await enhanceAssetPhoto(assetId);
      if (enhancedUrl) {
        // Use enhanced version as the primary URL, keep original in metadata
        await sql`UPDATE media_assets SET storage_url = ${enhancedUrl} WHERE id = ${assetId}`;
      }
    } catch (err) {
      console.warn("Photo enhancement failed:", err instanceof Error ? err.message : err);
      // Non-blocking — original photo is still fine
    }
  }

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
  personaPrompt?: string | null
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

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: storageUrl },
          },
          {
            type: "text",
            text: `Analyze this image for a social media content pipeline.

Context note from subscriber: "${contextNote}"
${subscriberPillar ? `Subscriber suggested pillar: ${subscriberPillar}` : ""}
${pillarGuidance ? `## Content Pillars & Tags\n${pillarGuidance}\n` : `Available content pillars: ${pillarList}`}
${brandContext}

Respond with ONLY valid JSON (no markdown):
{
  "quality_score": <0.0-1.0, see scoring guide below>,
  "content_pillars": [<1-3 matching pillar IDs from the pillars above, ordered by relevance>],
  "content_tags": [<2-5 matching tag IDs from the tags above, ordered by relevance>],
  "platform_fit": [<array of: "ig_feed", "ig_story", "ig_reel", "gbp", "youtube", "youtube_short", "fb_feed", "tiktok", "twitter", "linkedin", "pinterest">],
  "has_faces": <true/false>,
  "has_text_overlay": <true/false>,
  "description": "<1-sentence description of what's in the image>",
  "quality_notes": "<brief note on quality issues if any>",
  "detected_personas": [{"persona_id": "<id>", "persona_name": "<name>", "confidence": <0.0-1.0>, "role": "subject"|"background", "reasoning": "<why>"}]
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

  // Parse response
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text);

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
      quality_notes: parsed.quality_notes,
      has_faces: parsed.has_faces,
      has_text_overlay: parsed.has_text_overlay,
      detected_personas: parsed.detected_personas || [],
    },
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
