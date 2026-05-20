/**
 * Director Call — Hop 1 of the director pattern.
 *
 * Pipeline: Script → [Director Call] → the brief → [Producer Call] → the render
 *
 * The Director reads the source still (vision), the subscriber's
 * transcript (script), the analysis JSON (canonical entities), the
 * brand voice, and the template context — then writes ONE cinematic
 * brief for Kling's image-to-video. See project_tracpost_director_pattern.
 *
 * Model: Sonnet 4.6, multimodal, fixed (not tier-conditional). The
 * Director does genuine visual composition reading — writing camera
 * moves from text alone would be writing blind. Haiku is deliberately
 * avoided: the retired reward-prompt catalog's "every kitchen looks the
 * same" sameness was a Haiku-generated artifact, and the Director
 * exists to escape exactly that.
 *
 * Four input modalities, none redundant:
 *   - Vision (the image)  → how it's framed: composition, light, depth
 *   - Transcript (script) → why it matters: story, emotion, threads
 *   - Analysis JSON       → what it is, named: canonical entities
 *   - Brand DNA           → how to say it: voice, tone
 *
 * Graceful failure: returns null on any error. The caller
 * (variant-render.ts) falls back to Ken Burns — render-pipeline
 * integrity beats creative quality.
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
 * Per-template creative spec. The template shapes the STRUCTURE of the
 * brief (punchy vs atmospheric vs documentary) and carries the
 * duration the brief must be written for — a 5s idea is tighter than
 * a 10s one. Aspect ratio is the Producer Call's concern, not the
 * brief's, so it lives with the Kling call, not here.
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

/** The seven amplifiable narrative threads (see memo). The Director
 * picks exactly ONE per brief and records which in the audit trail. */
export type NarrativeThread =
  | "authority"
  | "philosophy"
  | "benefit"
  | "pain_point"
  | "brand_citation"
  | "project_context"
  | "persona";

/**
 * Everything the Director needs to write one brief. The caller
 * (variant-render.ts or the director-prompt inspector) assembles this;
 * the Director module itself does no DB work — it only fetches + encodes
 * the image. Keeps the module testable with fixtures and reusable by
 * the inspector.
 */
export interface DirectorInput {
  /** Source still URL (R2). For video sources, pass the poster frame.
   * The Director fetches + base64-encodes this internally. */
  imageUrl: string;
  /** The script. Subscriber's briefing transcript — may be null. */
  transcript: string | null;
  /** ai_analysis JSON — scene_type, description, detected entities. */
  analysis: Record<string, unknown> | null;
  /** Creator caption — fallback narrative when transcript is thin. */
  contextNote: string | null;
  /** Brand DNA voice signals — tone, casing, distinctive traits. */
  brandVoice: Record<string, unknown> | null;
  /** Which template this brief is for. */
  template: DirectorTemplate;
  /** Variety constraint: threads already amplified for this asset, so
   * the Director deliberately picks a different one. */
  previousThreads?: NarrativeThread[];
}

/**
 * The brief — the Director Call's output. Handed to the Production
 * Call (Kling) and persisted to asset_variants.render_settings.director.
 */
export interface DirectorBrief {
  /** The cinematic prompt for Kling — action + camera + mood. */
  prompt: string;
  /** Which narrative thread this brief amplified. */
  threadUsed: NarrativeThread;
  /** Canonical brand names woven in (from analysis JSON, not invented). */
  brandsMentioned: string[];
  /** The transcript fragment that anchored the creative choice. */
  transcriptSnippet: string;
}

/**
 * Build the Director's instructions. Kept as a standalone builder so
 * the director-prompt inspector can show it block-by-block and so it's
 * cheap to iterate (this prompt is expected to be tuned heavily).
 */
function buildDirectorPrompt(input: DirectorInput): string {
  const spec = DIRECTOR_TEMPLATE_SPECS[input.template];
  const voice = input.brandVoice || {};
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
        ? `Brands/products present: ${detectedVendors.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n") || "(no analysis available — direct from the image and script)";

  const voiceLines =
    [
      voice.tone ? `Tone: ${voice.tone}` : "",
      Array.isArray(voice.distinctive_traits)
        ? `Distinctive traits: ${(voice.distinctive_traits as string[]).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n") || "(no brand voice on file — keep the register honest and grounded)";

  const variety =
    input.previousThreads && input.previousThreads.length > 0
      ? `Already amplified for this asset: ${input.previousThreads.join(", ")}. Pick a DIFFERENT thread.`
      : "Nothing amplified yet for this asset — any thread is open.";

  return `You are the Director. You write ONE cinematic brief that an AI video model (Kling) will execute, turning a single still photo into a short video. The photo you are shown IS the first frame — Kling generates motion forward from it. Your brief describes what HAPPENS next: the camera move, and any small motion or light shift. It never re-describes what is already in the frame.

## The rule that matters most — stay real
TracPost's subscribers are real working businesses. Their entire advantage is being real. The video must feel like a true moment from their actual work — never a staged lifestyle scene, never invented people or events.

- DEFAULT to camera motion. The most authentic, most reliable move is the camera exploring a frozen real moment — a slow push toward the subject, a drift across the work, a tilt that reveals scale. The scene holds still; the camera brings it alive.
- Scene motion, if any, must be a PLAUSIBLE MICRO-CONTINUATION of what the photo froze: steam still rising, dust still settling, light shifting as a cloud passes, a hand finishing a motion ALREADY visible in the frame. Small, real, physically continuous.
- NEVER invent people who aren't in the photo, activities that aren't happening, drama, or lifestyle vignettes. Empty finished kitchen? The brief does not add a family. Wall mid-install? The brief does not add a crew walking in.
- The test: could this have plausibly happened in the half-second after the shutter clicked? If yes, allowed. If it needs new actors or events, forbidden.

## This render
Template: ${spec.label} — ${spec.durationSeconds} seconds.
Creative direction: ${spec.guidance}

## The script (the subscriber's own words)
${input.transcript || input.contextNote || "(no script — direct from the image and analysis)"}

## What the analysis knows about this image
${analysisLines}

## Brand voice → the camera's personality
The brand voice does not change the WORDS of your brief — Kling reads it as a video model, not a copywriter. It changes the camera's FEEL. Translate it into visual choices:
- Grounded / blue-collar / no-nonsense → handheld or steady moves, natural light, unglamorous and honest. The camera works the way the trade works.
- Premium / refined → smooth, controlled, elevated moves; careful light; polish.
This business's voice:
${voiceLines}

## How Kling behaves — write for it
Kling executes literally and tends to over-animate. Write for restraint:
- Name ONE primary camera move in plain terms: push in, pull back, dolly, pan, tilt, orbit, crane, handheld drift, or rack focus.
- Add at most one small motion or light element beyond the camera.
- Keep the brief to 40-70 words. Specific beats elaborate.
- Avoid directing what Kling distorts: faces in tight close-up (they morph), text or logos in motion (they warp), complex hand or finger movement, fast or chaotic action. If the subject is a face or a logo, keep the move gentle and at a respectful distance.

## Your job
1. LOOK at the image. Read the real composition — where the subject sits, the light direction, foreground/background depth, negative space. Compose the camera move FOR this actual frame.
2. The script usually carries several threads at once — authority, philosophy, benefit, pain_point, brand_citation, project_context, persona. Identify which are present, then pick the ONE this template's creative direction serves best. ${variety}
3. Write the brief: 40-70 words, one camera move, grounded and real, for a ${spec.durationSeconds}-second clip. Name brands ONLY if the analysis lists them — never invent.

## A strong brief looks like this
(Story template, philosophy thread, photo of an insulated-but-unfinished wall cavity)
"A slow, low drift along the wall cavity, the camera gliding past the foam board and rough-in like an inspector taking it in. Cool, even light; the scene itself stays still. The shot lingers a half-beat on a sealed seam, then eases to a stop."
Why it works: one camera move, zero invented people, the motion is pure camera exploring a real frozen moment, and it lands the philosophy thread — the care that no one sees.

## Output — JSON only, no markdown
{
  "prompt": "the 40-70 word cinematic brief for Kling",
  "thread_used": "<one of: authority, philosophy, benefit, pain_point, brand_citation, project_context, persona>",
  "brands_mentioned": ["<canonical brand names woven in, or empty>"],
  "transcript_snippet": "<the verbatim fragment of the script that anchored your choice>"
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
      thread_used?: string;
      brands_mentioned?: string[];
      transcript_snippet?: string;
    };

    if (!parsed.prompt || typeof parsed.prompt !== "string") {
      console.warn("director: parsed response missing prompt");
      return null;
    }

    return {
      prompt: parsed.prompt,
      threadUsed: (parsed.thread_used as NarrativeThread) || "authority",
      brandsMentioned: Array.isArray(parsed.brands_mentioned)
        ? parsed.brands_mentioned.map(String)
        : [],
      transcriptSnippet: parsed.transcript_snippet || "",
    };
  } catch (err) {
    console.warn(
      "director: brief generation failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
