/**
 * Director Call — Hop 1 of the director pattern. VISUAL CREATION ONLY.
 *
 * Pipeline: [Director Call] → the brief → [Producer Call] → the render
 *
 * The Director's job is the camera move and nothing else. It produces
 * Layer 1 of the three-layer video (visual). Layers 2-3 — voice-over,
 * music, on-screen captions — are the separate audio/narration layer.
 * Storytelling lives in narration, not in a camera move, so the
 * transcript, narrative threads, and copywriting brand voice are NOT
 * inputs here — they route to the audio layer. See
 * project_tracpost_director_pattern + project_tracpost_copy_video_bifurcation.
 *
 * Three inputs, all visual:
 *   - Vision (the image)  → composition, light, depth, framing
 *   - Analysis JSON       → visual facts: scene_type, what's in frame,
 *                           which brands are visibly present
 *   - Brand tone          → camera register only (assured→smooth,
 *                           energetic→kinetic). Not the copywriting voice.
 *   plus Template context → camera energy + duration.
 *
 * Model: Sonnet 4.6, multimodal, fixed. The Director does genuine visual
 * composition reading — writing camera moves from text alone is blind.
 *
 * Graceful failure: returns null on any error. The caller falls back to
 * Ken Burns — render-pipeline integrity beats creative quality.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fetchAndConvert } from "@/lib/image-utils";

const anthropic = new Anthropic();

/** Sonnet 4.6 — locked for the Director Call (see memo). */
const DIRECTOR_MODEL = "claude-sonnet-4-6";

/** The three video-target templates the Director writes briefs for. */
export type DirectorTemplate = "reel_9x16" | "story_9x16" | "long_16x9";

/**
 * Per-template creative spec. The template shapes the camera energy of
 * the brief (punchy vs atmospheric vs documentary) and carries the
 * duration the brief must be written for. Aspect ratio is the Producer
 * Call's concern, not the brief's.
 */
export interface DirectorTemplateSpec {
  id: DirectorTemplate;
  label: string;
  durationSeconds: 5 | 10;
  guidance: string;
}

export const DIRECTOR_TEMPLATE_SPECS: Record<DirectorTemplate, DirectorTemplateSpec> = {
  reel_9x16: {
    id: "reel_9x16",
    label: "Reel",
    durationSeconds: 5,
    guidance:
      "Punchy and kinetic. The motion must read in the first 1-2 seconds — " +
      "assume a thumb hovering over the swipe. One decisive camera move, one " +
      "clear focal moment. Energy over contemplation.",
  },
  story_9x16: {
    id: "story_9x16",
    label: "Story",
    durationSeconds: 5,
    guidance:
      "Atmospheric and intimate. A slow, confident drift — let the viewer " +
      "settle into the space. Mood over momentum. This is the quiet, " +
      "behind-the-curtain register.",
  },
  long_16x9: {
    id: "long_16x9",
    label: "Long Video",
    durationSeconds: 10,
    guidance:
      "Documentary and composed. A wider establishing sensibility — room to " +
      "breathe across 10 seconds. A measured camera move that reveals, then " +
      "settles. Authoritative, unhurried.",
  },
};

/**
 * Everything the Director needs to write one visual brief. The caller
 * (variant-render.ts or the director inspector) assembles this; the
 * Director module does no DB work — it only fetches + encodes the image.
 */
export interface DirectorInput {
  /** Source still URL (R2). For video sources, pass the poster frame.
   * The Director fetches + base64-encodes this internally. */
  imageUrl: string;
  /** ai_analysis JSON — scene_type, description, detected entities.
   * Used only for visual facts (what's in frame, visible brands). */
  analysis: Record<string, unknown> | null;
  /** Brand tone string → camera register only (e.g. "expert and
   * assured" → smooth, controlled). NOT the copywriting voice traits. */
  brandTone: string | null;
  /** Which template this brief is for. */
  template: DirectorTemplate;
  /** Variety constraint: camera moves already used for this asset, so
   * the Director picks a different one across the 3 templates. */
  previousCameraMoves?: string[];
}

/**
 * The brief — the Director Call's output. Handed to the Producer Call
 * (Kling) and persisted to asset_variants.render_settings.director.
 */
export interface DirectorBrief {
  /** The cinematic prompt for Kling — camera move + any micro-motion. */
  prompt: string;
  /** Short descriptor of the primary camera move (e.g. "slow push in").
   * Drives the per-asset variety knob. */
  cameraMove: string;
  /** Brands visibly present in the shot the brief features (from the
   * analysis, never invented). */
  brandsMentioned: string[];
}

/**
 * Build the Director's instructions. Exported as a standalone builder so
 * the director inspector can show it without running the call — and so
 * it's cheap to iterate. Pure: same input always yields the same string.
 */
export function buildDirectorPrompt(input: DirectorInput): string {
  const spec = DIRECTOR_TEMPLATE_SPECS[input.template];
  const analysis = input.analysis || {};

  const sceneType = (analysis.scene_type as string) || "";
  const description = (analysis.description as string) || "";
  const detectedVendors = Array.isArray(analysis.detected_vendors)
    ? (analysis.detected_vendors as string[])
    : [];

  const analysisLines =
    [
      description ? `Visual: ${description}` : "",
      sceneType ? `Scene type: ${sceneType}` : "",
      detectedVendors.length > 0
        ? `Brands/products visibly present: ${detectedVendors.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n") || "(no analysis on file — direct from the image)";

  const toneLine = input.brandTone
    ? `This business's tone: ${input.brandTone}`
    : "(no brand tone on file — keep the register honest and grounded)";

  const variety =
    input.previousCameraMoves && input.previousCameraMoves.length > 0
      ? `Camera moves already used for this asset: ${input.previousCameraMoves.join("; ")}. Pick a DISTINCTLY DIFFERENT move.`
      : "No camera move used yet for this asset — any move is open.";

  return `You are the Director. You write ONE camera-move brief that an AI video model (Kling) will execute, turning a single still photo into a short video. The photo you are shown IS the first frame — Kling generates motion forward from it. Your brief describes what HAPPENS next: the camera move, and any small motion or light shift. It never re-describes what is already in the frame. Your job is the VISUAL only — the camera, not the story.

## The rule that matters most — stay real
TracPost's subscribers are real working businesses. Their entire advantage is being real. The video must feel like a true moment from their actual work — never a staged lifestyle scene, never invented people or events.

- DEFAULT to camera motion. The most authentic, most reliable move is the camera exploring a frozen real moment — a slow push toward the subject, a drift across the work, a tilt that reveals scale. The scene holds still; the camera brings it alive.
- Scene motion, if any, must be a PLAUSIBLE MICRO-CONTINUATION of what the photo froze: steam still rising, dust still settling, light shifting as a cloud passes, a hand finishing a motion ALREADY visible in the frame. Small, real, physically continuous.
- NEVER invent people who aren't in the photo, activities that aren't happening, drama, or lifestyle vignettes. Empty finished kitchen? The brief does not add a family. Wall mid-install? The brief does not add a crew walking in.
- The test: could this have plausibly happened in the half-second after the shutter clicked? If yes, allowed. If it needs new actors or events, forbidden.

## This render
Template: ${spec.label} — ${spec.durationSeconds} seconds.
Creative direction: ${spec.guidance}

## What the analysis knows about this image
${analysisLines}

## Brand tone → the camera's personality
The tone changes only the camera's FEEL, not any words. Translate it into visual choices:
- Grounded / blue-collar / no-nonsense → handheld or steady moves, natural light, unglamorous and honest. The camera works the way the trade works.
- Premium / refined / assured → smooth, controlled, elevated moves; careful light; polish.
${toneLine}

## How Kling behaves — write for it
Kling executes literally and tends to over-animate. Write for restraint:
- Name ONE primary camera move in plain terms: push in, pull back, dolly, pan, tilt, orbit, crane, handheld drift, or rack focus.
- Add at most one small motion or light element beyond the camera.
- Keep the brief to 40-70 words. Specific beats elaborate.
- Avoid directing what Kling distorts: faces in tight close-up (they morph), text or logos in motion (they warp), complex hand or finger movement, fast or chaotic action. If the subject is a face or a logo, keep the move gentle and at a respectful distance.

## Your job
1. LOOK at the image. Read the real composition — where the subject sits, the light direction, foreground/background depth, negative space. Compose the camera move FOR this actual frame.
2. Choose ONE camera move that this template's creative direction calls for. ${variety}
3. Write the brief: 40-70 words, one camera move, grounded and real, for a ${spec.durationSeconds}-second clip. Name brands ONLY if the analysis lists them as visibly present — never invent.

## A strong brief looks like this
(Story template, photo of an insulated-but-unfinished wall cavity)
"A slow, low drift along the wall cavity, the camera gliding past the foam board and rough-in like an inspector taking it in. Cool, even light; the scene itself stays still. The shot lingers a half-beat on a sealed seam, then eases to a stop."
Why it works: one camera move, zero invented people, the motion is pure camera exploring a real frozen moment, composed for the actual frame.

## Output — JSON only, no markdown
{
  "prompt": "the 40-70 word camera-move brief for Kling",
  "camera_move": "<2-4 word descriptor of the primary move, e.g. 'slow push in'>",
  "brands_mentioned": ["<brands visibly present that the shot features, or empty>"]
}`;
}

/**
 * Run the Director Call. Returns the brief, or null on any failure
 * (caller falls back to Ken Burns).
 */
export async function directVideoBrief(
  input: DirectorInput,
): Promise<DirectorBrief | null> {
  if (!input.imageUrl) {
    console.warn("director: no imageUrl provided");
    return null;
  }

  try {
    // Vision leg — fetch + encode the source still. fetchAndConvert
    // handles HEIC → JPEG so Claude always gets a supported format.
    const { data: imgBuffer, mimeType } = await fetchAndConvert(input.imageUrl);
    const imgBase64 = imgBuffer.toString("base64");

    const response = await anthropic.messages.create({
      model: DIRECTOR_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imgBase64,
              },
            },
            { type: "text", text: buildDirectorPrompt(input) },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("director: no JSON object in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      prompt?: string;
      camera_move?: string;
      brands_mentioned?: string[];
    };

    if (!parsed.prompt || typeof parsed.prompt !== "string") {
      console.warn("director: parsed response missing prompt");
      return null;
    }

    return {
      prompt: parsed.prompt,
      cameraMove: parsed.camera_move || "",
      brandsMentioned: Array.isArray(parsed.brands_mentioned)
        ? parsed.brands_mentioned.map(String)
        : [],
    };
  } catch (err) {
    console.warn(
      "director: brief generation failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
