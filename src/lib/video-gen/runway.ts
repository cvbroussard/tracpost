/**
 * Runway (Gen-4 Turbo) video generation client.
 *
 * Image-to-video via the Runway API — same image-to-video contract as
 * kling.ts and gemini-veo.ts: source still becomes (or strongly conditions)
 * the first frame, prompt drives motion, result lands in R2.
 *
 * Auth: RUNWAYML_API_SECRET. The X-Runway-Version header is required by
 * the Runway API — version string env-overridable in case Runway bumps it.
 *
 * Model: gen4_turbo by default, env-overridable (GEN4_TURBO is the
 * current image-to-video sweet spot; switch via RUNWAYML_MODEL if a
 * newer/different model is preferred).
 */

import sharp from "sharp";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import { cdnImageForced } from "@/lib/cdn-image";

const API_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = process.env.RUNWAYML_API_VERSION || "2024-11-06";
const RUNWAY_MODEL = process.env.RUNWAYML_MODEL || "gen4_turbo";

/**
 * Producer-side prompt adapter (per the per-producer adapter pattern in
 * [[runway-gen4-prompting]]). The Director produces engine-agnostic shot
 * direction following Runway's element order; this adapter applies any
 * Runway-specific final shaping before the API call.
 *
 * v1: universal cleanup only (collapse whitespace, trim). The Director
 * prompt rewrite already produces Runway-shaped output, so most of the
 * Runway-specific work happens upstream. This function is the architectural
 * slot for future divergence — e.g., enforcing length caps, swapping
 * vocabulary, appending style descriptors if the Director omits one.
 */
export function shapeForRunway(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim();
}

interface RunwayVideo {
  url: string;
  duration: number;
}

// Runway's supported output ratios (Gen-4 Turbo). The source's aspect
// gets mapped to the closest one — we no longer pre-crop, so this is
// where source-aspect-aware framing lives for Runway.
const RUNWAY_RATIOS: { label: string; value: number }[] = [
  { label: "1280:720", value: 1280 / 720 },   // 16:9 landscape
  { label: "720:1280", value: 720 / 1280 },   // 9:16 portrait
  { label: "1104:832", value: 1104 / 832 },   // ~4:3 landscape
  { label: "832:1104", value: 832 / 1104 },   // ~3:4 portrait
  { label: "960:960",  value: 1 },             // 1:1 square
  { label: "1584:672", value: 1584 / 672 },   // ~21:9 ultrawide
];

function closestRunwayRatio(sourceAspect: number): string {
  let best = RUNWAY_RATIOS[0];
  let minDiff = Math.abs(sourceAspect - best.value);
  for (const r of RUNWAY_RATIOS) {
    const diff = Math.abs(sourceAspect - r.value);
    if (diff < minDiff) {
      minDiff = diff;
      best = r;
    }
  }
  return best.label;
}

/**
 * Generate a video from a still image using Runway Gen-4 Turbo.
 *
 * Output aspect: the source's aspect, mapped to the closest Runway-
 * supported ratio. Runway requires the `ratio` param (not optional),
 * so we probe the source's dimensions and pick the nearest. No pre-crop —
 * the model sees the full source frame; downstream Smart Rotate handles
 * target-aspect framing.
 *
 * @param imageUrl    - URL of the source image (R2 or external)
 * @param prompt      - Motion/action prompt (camera move, mood)
 * @param siteId      - owning site; scopes the R2 key
 * @param options     - duration: 5 | 10
 * @returns the R2 URL + duration, or null on any failure (caller decides)
 */
export async function generateVideoFromImageRunway(
  imageUrl: string,
  prompt: string,
  siteId: string,
  options: { duration?: 5 | 10 } = {},
): Promise<RunwayVideo | null> {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) {
    console.warn("RUNWAYML_API_SECRET not set — skipping Runway video generation");
    return null;
  }

  const { duration = 5 } = options;
  const shapedPrompt = shapeForRunway(prompt);

  try {
    // Fetch a CDN-resized JPEG (aspect-preserving scale-down, capped at
    // 1568px) — keeps the base64 payload manageable without altering the
    // source's aspect.
    const imgRes = await fetch(
      cdnImageForced(imageUrl, {
        width: 1568,
        height: 1568,
        fit: "scale-down",
        format: "jpeg",
        quality: 85,
      }),
    );
    if (!imgRes.ok) {
      console.warn("Runway: source image fetch failed:", imgRes.status);
      return null;
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Probe source dimensions to pick the closest Runway-supported ratio.
    const meta = await sharp(imgBuffer).metadata();
    const sourceAspect =
      (meta.width || 1) / (meta.height || 1);
    const ratio = closestRunwayRatio(sourceAspect);

    const promptImage = `data:image/jpeg;base64,${imgBuffer.toString("base64")}`;

    // Hop A — start the image-to-video task.
    const startRes = await fetch(`${API_BASE}/image_to_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": RUNWAY_VERSION,
      },
      body: JSON.stringify({
        model: RUNWAY_MODEL,
        promptImage,
        promptText: shapedPrompt,
        ratio,
        duration,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!startRes.ok) {
      const err = await startRes.text();
      console.warn("Runway start failed:", startRes.status, err.slice(0, 300));
      return null;
    }

    const startData = await startRes.json();
    const taskId: string | undefined = startData.id;
    if (!taskId) {
      console.warn("Runway returned no task id");
      return null;
    }

    // Hop B — poll the task. Capped at ~3.5 min so the whole route
    // (gatherDirectorContext + render + download + R2 upload) stays
    // inside the 300s function budget.
    const maxAttempts = 42;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollRes = await fetch(`${API_BASE}/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": RUNWAY_VERSION,
        },
      });
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status: string | undefined = pollData.status;

      if (status === "SUCCEEDED") {
        const outputUrl: string | undefined = Array.isArray(pollData.output)
          ? pollData.output[0]
          : undefined;
        if (!outputUrl || typeof outputUrl !== "string") {
          console.warn("Runway succeeded but no output URL found");
          return null;
        }

        const videoRes = await fetch(outputUrl, {
          signal: AbortSignal.timeout(60000),
        });
        if (!videoRes.ok) {
          console.warn("Runway video download failed:", videoRes.status);
          return null;
        }
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const fname = seoFilename(shapedPrompt.slice(0, 40) || "video", "mp4");
        const key = `sites/${siteId}/media/${fname}`;
        const r2Url = await uploadBufferToR2(key, videoBuffer, "video/mp4");

        return { url: r2Url, duration };
      }

      if (status === "FAILED" || status === "CANCELLED") {
        const detail = pollData.failure || pollData.failureCode || status;
        console.warn(
          "Runway task failed:",
          typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300),
        );
        return null;
      }

      // PENDING / THROTTLED / RUNNING — continue polling.
    }

    console.warn("Runway task timed out (~3.5 min poll cap)");
    return null;
  } catch (err) {
    console.warn("Runway video gen error:", err instanceof Error ? err.message : err);
    return null;
  }
}
