/**
 * Director Call — Hop 1 of the director pattern. VISUAL CREATION ONLY.
 *
 * Pipeline: [Director Call] → the shot direction → [Producer Call] → the render
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
 * Graceful failure: never throws — returns { direction: null, error } on
 * any failure. The render pipeline ignores `error` and falls back to Ken
 * Burns; the Motion Gen inspector surfaces it so a failed call is
 * diagnosable instead of a silent null.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cdnImageForced } from "@/lib/cdn-image";

const anthropic = new Anthropic();

/** Sonnet 4.6 — locked for the Director Call (see memo). */
export const DIRECTOR_MODEL = "claude-sonnet-4-6";

/** The three video-target templates the Director writes shot directions for. */
export type DirectorTemplate = "reel_9x16" | "story_9x16" | "long_16x9";

/**
 * Per-template creative spec. The template shapes the camera energy of
 * the shot direction (punchy vs atmospheric vs documentary) and carries
 * the duration it must be written for. Aspect ratio is the Producer
 * Call's concern, not the shot direction's.
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
      "Punchy and kinetic. The motion must READ in the first 1-2 seconds — " +
      "assume a thumb hovering over the swipe. 'Punchy' means instantly " +
      "legible, NOT fast or far-travelling: a decisive arcing push at a " +
      "gentle pace. The curve carries the energy; one clear focal moment.",
  },
  story_9x16: {
    id: "story_9x16",
    label: "Story",
    durationSeconds: 5,
    guidance:
      "Atmospheric and intimate. A slow, confident arcing drift — let the " +
      "viewer settle into the space as the camera curves through it. Mood " +
      "over momentum. The quiet, behind-the-curtain register.",
  },
  long_16x9: {
    id: "long_16x9",
    label: "Long Video",
    durationSeconds: 10,
    guidance:
      "Documentary and composed. A wider establishing sensibility — 10 " +
      "seconds is room for a longer, sweeping arc that reveals, then " +
      "settles. Unhurried and authoritative.",
  },
};

/**
 * Everything the Director needs to write one shot direction. The caller
 * (variant-render.ts or the Motion Gen inspector) assembles this; the
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
  /** Which template this shot direction is for. */
  template: DirectorTemplate;
  /** Variety constraint: camera moves already used for this asset, so
   * the Director picks a different one across the 3 templates. */
  previousCameraMoves?: string[];
}

/**
 * The shot direction — the Director Call's output. Handed to the Producer
 * Call (Kling / Veo) and persisted to asset_variants.render_settings.director.
 */
export interface ShotDirection {
  /** The cinematic prompt for the render engine — camera move + any
   * micro-motion. The one field still called a "prompt": it IS the prompt
   * the Producer model (Kling / Veo) receives. */
  renderPrompt: string;
  /** Short descriptor of the primary camera move (e.g. "arcing push-in").
   * Drives the per-asset variety knob. */
  cameraMove: string;
  /** Brands visibly present in the shot it features (from the analysis,
   * never invented). */
  brandsMentioned: string[];
}

/**
 * Build the Director's instructions — the text Sonnet receives. Exported
 * as a standalone builder so the Motion Gen inspector can show it without
 * running the call. Pure: same input always yields the same string.
 */
export function buildDirectorInstructions(input: DirectorInput): string {
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
      ? `Camera moves already used for this asset: ${input.previousCameraMoves.join("; ")}. Pick a DISTINCTLY DIFFERENT move (vary the arc direction or the move type).`
      : "No camera move used yet for this asset — any move is open.";

  return `You are the Director. You write ONE camera-move brief that an AI video model (Kling) will execute, turning a single still photo into a short video. The photo you are shown IS the first frame — Kling generates motion forward from it. Your brief describes what HAPPENS next: the camera move, and any small motion or light shift. It never re-describes what is already in the frame. Your job is the VISUAL only — the camera, not the story.

## The rule that matters most — stay real
TracPost's subscribers are real working businesses. Their entire advantage is being real. The video must feel like a true moment from their actual work — never a staged lifestyle scene, never invented people or events.

- DEFAULT to camera motion. The most authentic, most reliable move is the camera exploring a frozen real moment — a slow arcing push toward the subject, a curving drift across the work. The scene holds still; the camera brings it alive.
- Scene motion, if any, must be a PLAUSIBLE MICRO-CONTINUATION of what the photo froze: steam still rising, dust still settling, light shifting as a cloud passes, a hand finishing a motion ALREADY visible in the frame. Small, real, physically continuous.
- NEVER invent people who aren't in the photo, activities that aren't happening, drama, or lifestyle vignettes. Empty finished kitchen? The brief does not add a family. Wall mid-install? The brief does not add a crew walking in.
- The test: could this have plausibly happened in the half-second after the shutter clicked? If yes, allowed. If it needs new actors or events, forbidden.

## The camera move — curve it
A still photo becomes a video when the CAMERA travels through 3-D space. As the viewpoint changes, near things and far things separate on their own — the depth comes alive. That depth separation is the entire point of this render; without it the clip is a flat zoom on a photo, which is worthless. (Filmmakers call the effect parallax. That word, and the effect, are YOUR reasoning for choosing the move — they NEVER appear in the brief, and you never describe objects separating. See "How Kling behaves" below.)

Depth separation is produced by ONE thing: the SIDEWAYS component of the camera's motion. This drives every move you choose:
- A STRAIGHT push-in (camera moving straight toward the subject) has almost no sideways component. It reads as a flat zoom. Do not default to it.
- A CURVED, ARCING path — the camera advances while sweeping to one side — has a strong sideways component at every point. The depth reads even when the move is small and slow.
- A PAN or TILT is the camera rotating in place. Rotation is not travel — it does nothing for depth. Never use a pan or tilt as the main move.

DEFAULT to an arcing push-in: the camera moves toward the subject AND curves to one side as it goes. Make the arc a real, visible sweep — not a straight line with a hint of bend. The forward motion gives the sense of approaching the work; the sideways sweep is what makes the depth read.

This is what lets the move stay gentle — you do NOT need a fast, aggressive throw. The curve does the work; a slow, modest arcing move reads as a genuine camera gliding through the space.

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
Kling executes literally and tends to over-animate. It has no concept of "the camera" versus "the scene" — it reads every sentence as something to ANIMATE. Write for restraint:
- THE CARDINAL RULE — describe ONLY the camera. Every motion verb in the brief must take the CAMERA as its subject ("the camera advances", "the camera curves left", "the arc eases to a stop"). NEVER attach a motion verb to a scene object — no "the board slides", "the foreground shifts", "the panel drifts", "the island moves against the wall". Kling takes "[object] slides" literally and physically slides that object — gravity, slope and all. The scene is frozen; the ONLY thing that moves is the camera. Do NOT name parallax and do NOT describe foreground separating from background — depth separation is the camera's job, and stating it as an outcome invites Kling to fake it by moving objects.
- The ONE camera move comes from the depth-revealing family: an arcing push-in (your default), a curved dolly, an orbit, or a lateral truck. Avoid straight pushes; never make a pan or tilt the move.
- Keep the pace gentle and eased — ease into the move, ease to a stop. The curve, not speed, makes the depth read, so there is no need to rush. Scale the arc's reach to the ${spec.durationSeconds} seconds available.
- One small ambient motion (steam, dust, a light shift) is allowed ONLY as a true micro-continuation — never the subject, never anything that relocates an object.
- Keep the brief to 40-70 words. Specific beats elaborate.
- Avoid directing what Kling distorts: faces in tight close-up (they morph), text or logos in motion (they warp), complex hand or finger movement, fast or chaotic action. If the subject is a face or a logo, keep the move gentle and at a respectful distance.

## Your job
1. LOOK at the image. Read the real composition and especially the DEPTH — what sits in the foreground, what sits behind. The depth comes alive between those layers, so the camera move must be built around them.
2. Compose ONE arcing camera move for THIS frame: which way should the curve sweep, given where the subject and the depth layers sit. ${variety}
3. Write the brief: 40-70 words describing ONLY the camera and its path — gentle, eased, one arcing move, for a ${spec.durationSeconds}-second clip. The scene is frozen; no scene object moves. Name brands ONLY if the analysis lists them as visibly present — never invent.

## A strong brief looks like this
(Story template, photo of a finished kitchen — an island in the foreground, cabinetry along the back wall)
"A slow arcing push-in: the camera eases forward toward the cabinetry, curving gently to the right as it travels so its path sweeps well to the side rather than straight in. Everything in the room is frozen — only the camera moves. Cool, even light, unchanging. The arc eases to a stop with the range hood centered."
Why it works: every verb belongs to the camera — not one scene object is described as moving. The strong sideways curve does the depth work on its own, and the scene is stated as frozen, so Kling animates nothing but the camera.

## Output — JSON only, no markdown
{
  "prompt": "the 40-70 word camera-move brief for Kling",
  "camera_move": "<2-4 word descriptor of the move, e.g. 'arcing push-in'>",
  "brands_mentioned": ["<brands visibly present that the shot features, or empty>"]
}`;
}

/**
 * Run the Director Call. Returns the shot direction, or { direction: null,
 * error } on any failure (caller falls back to Ken Burns).
 */
export async function directShot(
  input: DirectorInput,
): Promise<{ direction: ShotDirection | null; error: string | null }> {
  if (!input.imageUrl) {
    console.warn("director: no imageUrl provided");
    return { direction: null, error: "No source image URL provided." };
  }

  try {
    // Vision leg — fetch the source still through the CDN, capped at
    // 1568px and transcoded to JPEG. Anthropic rejects images over 5 MB
    // (and downscales past 1568px anyway), so a raw full-res phone photo
    // would 400 the call. The CDN resize also covers HEIC → JPEG.
    const imgRes = await fetch(
      cdnImageForced(input.imageUrl, {
        width: 1568,
        height: 1568,
        fit: "scale-down",
        format: "jpeg",
        quality: 85,
      }),
    );
    if (!imgRes.ok) {
      return {
        direction: null,
        error: `Failed to fetch the source image (${imgRes.status}).`,
      };
    }
    const imgBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");

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
                media_type: "image/jpeg",
                data: imgBase64,
              },
            },
            { type: "text", text: buildDirectorInstructions(input) },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("director: no JSON object in response");
      return { direction: null, error: "The Director Call returned no JSON object." };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      prompt?: string;
      camera_move?: string;
      brands_mentioned?: string[];
    };

    if (!parsed.prompt || typeof parsed.prompt !== "string") {
      console.warn("director: parsed response missing prompt");
      return {
        direction: null,
        error: "The Director Call response had no prompt field.",
      };
    }

    return {
      direction: {
        renderPrompt: parsed.prompt,
        cameraMove: parsed.camera_move || "",
        brandsMentioned: Array.isArray(parsed.brands_mentioned)
          ? parsed.brands_mentioned.map(String)
          : [],
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("director: shot direction failed:", message);
    return { direction: null, error: message };
  }
}
