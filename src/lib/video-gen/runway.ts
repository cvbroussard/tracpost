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

import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import { cdnImageCroppedToAspect } from "@/lib/cdn-image";

const API_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = process.env.RUNWAYML_API_VERSION || "2024-11-06";
const RUNWAY_MODEL = process.env.RUNWAYML_MODEL || "gen4_turbo";

interface RunwayVideo {
  url: string;
  duration: number;
}

/** Runway expects pixel-ratio strings, not aspect labels. */
function ratioFor(aspect: "16:9" | "9:16"): string {
  return aspect === "16:9" ? "1280:720" : "720:1280";
}

/**
 * Generate a video from a still image using Runway Gen-4 Turbo.
 *
 * @param imageUrl    - URL of the source image (R2 or external)
 * @param prompt      - Motion/action prompt (camera move, mood)
 * @param siteId      - owning site; scopes the R2 key
 * @param options     - aspectRatio: "16:9" | "9:16"; duration: 5 | 10
 * @returns the R2 URL + duration, or null on any failure (caller decides)
 */
export async function generateVideoFromImageRunway(
  imageUrl: string,
  prompt: string,
  siteId: string,
  options: { aspectRatio?: "16:9" | "9:16"; duration?: 5 | 10 } = {},
): Promise<RunwayVideo | null> {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) {
    console.warn("RUNWAYML_API_SECRET not set — skipping Runway video generation");
    return null;
  }

  const { aspectRatio = "9:16", duration = 5 } = options;

  try {
    // Fetch a CDN-cropped JPEG at the requested aspect — image-to-video
    // producers derive output aspect from the input frame, so we settle
    // aspect at the source rather than rely on the API's ratio param.
    // Send as a base64 data URL so the call is self-contained (Runway
    // also accepts public URLs; data URL eliminates the
    // we-just-uploaded-to-R2-can-Runway-reach-it race).
    const imgRes = await fetch(cdnImageCroppedToAspect(imageUrl, aspectRatio));
    if (!imgRes.ok) {
      console.warn("Runway: source image fetch failed:", imgRes.status);
      return null;
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
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
        promptText: prompt,
        ratio: ratioFor(aspectRatio),
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
        const fname = seoFilename(prompt.slice(0, 40) || "video", "mp4");
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
