/**
 * Director Call — Hop 1 of the director pattern. VISUAL CREATION ONLY.
 *
 * Pipeline: [Vision call (cascade)] → motion_sequence → [Director Call] →
 *           the shot direction → [Producer Call] → the render
 *
 * The Director composes a shot direction from Vision's recovered motion
 * sequence (the implicit clip the still was captured from) into a
 * producer-ready prompt structured to Runway's element order — see
 * [[tracpost-motion-capture-principle]] + [[runway-gen4-prompting]].
 *
 * Inputs:
 *   - Vision (the image)  → composition, light, depth, framing (Sonnet
 *                           re-sees so it can compose; it does not re-infer
 *                           motion — that lives in motion_sequence)
 *   - Analysis JSON       → visual facts (scene_type, brands present) +
 *                           motion_sequence (subject/camera/scene observations
 *                           Vision already inferred under visual-evidence
 *                           discipline)
 *   - Brand tone          → camera register only
 *   - Template            → camera energy + duration
 *
 * Storytelling lives in narration (Layer 2-3 — voice-over, music, on-screen
 * captions), so the transcript and copywriting voice traits route to the
 * audio layer, NOT the Director.
 *
 * Model: Sonnet 4.6, multimodal, fixed.
 *
 * Graceful failure: never throws — returns { direction: null, error } on
 * any failure. The render pipeline ignores `error` and falls back to Ken
 * Burns; the Motion Gen inspector surfaces it for diagnosis.
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
 * the duration it must be written for. Aspect ratio is NOT a Director
 * concern — producers render at the source's aspect; Smart Rotate
 * downstream handles target-aspect framing per the post-render reframer
 * design (2026-05-22).
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

  // Visual facts (from cascade-analyze vision pass)
  const sceneType = (analysis.scene_type as string) || "";
  const description = (analysis.description as string) || "";
  const detectedVendors = Array.isArray(analysis.detected_vendors)
    ? (analysis.detected_vendors as string[])
    : [];

  // Motion sequence (from cascade-analyze vision pass — Vision's recovery
  // of the implicit motion clip under visual-evidence discipline).
  const motionSequence =
    (analysis.motion_sequence as Record<string, unknown> | null) || {};
  const subjectMotion =
    typeof motionSequence.subject_motion === "string"
      ? (motionSequence.subject_motion as string).trim()
      : "";
  const cameraContext =
    typeof motionSequence.camera_context === "string"
      ? (motionSequence.camera_context as string).trim()
      : "";
  const sceneContext =
    typeof motionSequence.scene_context === "string"
      ? (motionSequence.scene_context as string).trim()
      : "";

  const motionLines =
    [
      `Subject motion observed: ${subjectMotion || "(none — no in-frame subject was in motion-implying posture; the camera is the dominant motion source)"}`,
      `Camera context observed: ${cameraContext || "(photographer position unclear; default to a gentle arcing approach)"}`,
      `Scene context observed: ${sceneContext || "(no environmental motion observed)"}`,
    ].join("\n");

  const analysisLines =
    [
      description ? `Visual: ${description}` : "",
      sceneType ? `Scene type: ${sceneType}` : "",
      detectedVendors.length > 0
        ? `Brands/products visibly present: ${detectedVendors.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n") || "(no analysis on file — read direct from the image)";

  const toneLine = input.brandTone
    ? `This business's tone: ${input.brandTone}`
    : "(no brand tone on file — keep the register honest and grounded)";

  const variety =
    input.previousCameraMoves && input.previousCameraMoves.length > 0
      ? `Camera moves already used for this asset: ${input.previousCameraMoves.join("; ")}. Pick a DISTINCTLY DIFFERENT move (vary the arc direction or the move type).`
      : "No camera move used yet for this asset — any move is open.";

  return `You are the Director. You write ONE shot direction that an AI video model (Kling or Runway) executes, turning a single still photo into a 5-10 second video. The photo you are shown IS the first frame — the model generates motion forward from it.

## Foundational principle — recover the implicit motion clip
Every photograph is a frozen frame from a 5-10 second motion clip. Something was happening before the shutter clicked, and something would have continued after. Your job is to RECOVER and describe that motion. The Vision call has already inferred what was happening visually under strict visual-evidence discipline; you compose its observations into a producer-ready shot direction.

Three motion sources (Runway's recommended element order):
1. SUBJECT motion — what in-frame subjects were doing
2. CAMERA motion — what the photographer was doing
3. SCENE motion — what the environment was doing (light, fabric, dust)

## Vision call observations — your primary input
${motionLines}

CRITICAL: NEVER invent subject motion the Vision call did not observe. If subject_motion is empty, the camera is the dominant motion source — write a camera move, skip subject motion. Inert objects (insulation, sheathing, parked equipment) NEVER move on their own under any circumstances.

## Stay real
TracPost's subscribers are real working businesses. Real wins. The video must feel like a true moment from their actual work — never invented people, activities, drama, or lifestyle vignettes. The test: could this have plausibly happened in the seconds the captured moment was a slice of? If yes, allowed. If it needs new actors or events the Vision didn't observe, forbidden.

## Camera move — Runway-canonical vocabulary
Pick ONE primary camera move from this list. Use Runway's exact terms verbatim (the model recognizes these specifically — generic film terminology produces weaker adherence).

**Default selection is subject-motion-aware** (this is the load-bearing rule):

When Vision observed SUBJECT motion in the frame, default to:
- **Static** — camera holds completely still; the subject's motion dominates the frame. MANDATORY when Static is chosen: end the prompt with this EXACT phrase verbatim — "The camera is entirely motionless for the duration of the scene, with movement only occurring from the subject." Static cameras are HARD for video models; this canonical reinforcement is REQUIRED or the model will drift.
- **Tracking** — camera follows alongside the moving subject (e.g., follows the swinging hammer, follows the excavator boom through its dig arc)
- **Handheld** — subtle natural shake; intimate documentary feel for grounded brand tones

When Vision observed NO subject motion (camera is the motion source), default to:
- **Arc** — camera moves in a curved path around or toward the subject. Sideways curve produces the depth separation that makes the clip read.
- **Push in** — camera moves closer to the subject. Combine with Arc for a curved approach; a straight push reads as flat zoom.
- **Pull back** — camera moves away from the subject; "reveal" shot
- **Truck** — camera moves left or right, parallel to the subject; lateral travel
- **Orbit** — camera circles completely around the subject
- **Pedestal** — camera moves straight up or down vertically (useful for tall scenes)
- **Crane/Jib** — camera moves up or down on a large arm (sweeping descents)

Brand-tone modifier:
- Grounded / blue-collar → Handheld or Static; natural light, honest movement
- Premium / refined → Gimbal or Steadicam smoothness; controlled, elevated

Never use as the main move:
- **Pan** or **Tilt** alone (rotation produces no depth — flat output)
- **Crash zoom**, **Whip pan** (too cinematic for grounded contractor content)

For moves that travel through the frame (Push in, Pull back, Truck, Crane/Jib, Tracking), describe what comes into view OR what gets revealed during the move — Runway's documented best practice.

Pace stays gentle and eased — ease into the move, ease to a stop. The curve / direction change does the work; speed doesn't need to. Scale the move's reach to the ${spec.durationSeconds} seconds available.

${variety}

## Brand tone → camera register
${toneLine}
- Grounded / blue-collar / no-nonsense → handheld or steady moves, natural light, honest movement
- Premium / refined / assured → smooth, controlled, elevated moves; polished

## This render
Template: ${spec.label} — ${spec.durationSeconds} seconds.
Creative direction: ${spec.guidance}

## Output structure — follow Runway's element order
Compose the renderPrompt in this order (aim for 30-70 words; Static cases run longer because of the required reinforcement phrase):

[Camera motion]. [Subject motion — only if Vision observed any]. [Static-reinforcement phrase IF using Static]. [Style descriptor].

**Worked example (rooftop drilling scene, Vision observed subject motion → Static camera)**:
"Static medium shot framed on the subject at work on the roof deck. The subject continues fastening the panel, the drill rotating steadily. The camera is entirely motionless for the duration of the scene, with movement only occurring from the subject. Cinematic documentary live-action."

**Worked example (finished kitchen, Vision observed no subject motion → Arc + Push in)**:
"The camera arcs gently to the right as it pushes in toward the back cabinetry, the range hood coming into view as the move settles. Cinematic documentary live-action."

**Worked example (excavator mid-dig with operator visible → Tracking)**:
"The camera tracks alongside the excavator as the boom continues its dig arc. The bucket scrapes through the soil, dirt cascading from the teeth. Cinematic documentary live-action."

## Discipline (universal — works on both Kling and Runway)
- **Positive phrasing only.** "Locked camera" — NOT "no camera movement". "The camera remains still" — NOT "the camera doesn't move".
- **In-progress phrasing for subject motion.** "continues / steadily / through" — NOT "starts / begins / initiates". The captured moment is mid-action, not at its start.
- **Generic subject terms.** "the subject", "the figure on the left", "the worker" — NOT named entities or detailed appearance descriptions. The image carries identity; text describes motion.
- **Do NOT re-describe the image** (clothing colors, materials, brand logos visible in the shot). Re-description reduces motion in output.
- **Do NOT mix abstract / conceptual language.** "Cinematic documentary live-action" works as a style descriptor; "the essence of craftsmanship" does not.
- **Do NOT describe motion the Vision call did not observe.** This is the universal restraint — the motion-capture principle generalizes the parallax fix. Inert objects never move regardless of how persuasive a camera arc looks.

## What the analysis knows about the image (visual facts only)
${analysisLines}

## Output — JSON only, no markdown
{
  "prompt": "the 30-60 word shot direction in Runway element order",
  "camera_move": "<2-4 word descriptor of the camera move, e.g. 'arcing push-in'>",
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
