/**
 * Kling AI video generation client.
 * Image-to-video with first-frame preservation.
 */

import * as jwt from "jsonwebtoken";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import { cdnImageCroppedToAspect } from "@/lib/cdn-image";

const API_BASE = "https://api.klingai.com/v1";

// Model version — env-overridable so a bump (e.g. v2-6 → v3.0) is a
// config change, not a code deploy, and a wrong value can be corrected
// without shipping. Default is the known-good v2-6.
const MODEL_NAME = process.env.KLING_MODEL_NAME || "kling-v2-6";

interface KlingVideo {
  url: string;
  duration: number;
}

/**
 * Generate JWT token for Kling API authentication.
 */
function generateKlingToken(): string {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_ACCESS_KEY and KLING_SECRET_KEY required");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ak,
    exp: now + 1800,
    nbf: now - 5,
  };

  return jwt.sign(payload, sk, { algorithm: "HS256" });
}

/**
 * Generate a video from a still image using Kling.
 * The input image becomes the first frame — scene fidelity preserved.
 *
 * @param imageUrl - URL of the source image (R2 or external)
 * @param prompt - Motion/action prompt (people, camera movement, mood)
 * @param duration - Video duration: "5" or "10" seconds
 * @param mode - "std" (standard) or "pro" (professional)
 */
export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  siteId: string,
  options: {
    duration?: "5" | "10";
    mode?: "std" | "pro";
    aspectRatio?: "16:9" | "9:16" | "1:1";
  } = {}
): Promise<KlingVideo | null> {
  const { duration = "5", mode = "std", aspectRatio = "9:16" } = options;

  try {
    const token = generateKlingToken();

    // Pre-crop the source to the requested aspect via CDN cover-fit.
    // Kling's image2video silently ignores aspect_ratio when an image
    // is provided — it always inherits the source's aspect. Pre-cropping
    // is what actually controls output shape (verified 2026-05-22: a
    // 4032×3024 source rendered 1108×828 despite aspect_ratio="9:16").
    const cropped = aspectRatio === "1:1" ? imageUrl : cdnImageCroppedToAspect(imageUrl, aspectRatio);

    // Create video generation task
    const createRes = await fetch(`${API_BASE}/videos/image2video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_name: MODEL_NAME,
        image: cropped,
        prompt,
        duration,
        mode,
        aspect_ratio: aspectRatio,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.warn("Kling create failed:", createRes.status, err.slice(0, 200));
      return null;
    }

    const createData = await createRes.json();
    const taskId = createData.data?.task_id;
    if (!taskId) {
      console.warn("Kling returned no task_id");
      return null;
    }

    // Poll for completion. Capped at ~3.5 min (was 5) so a single
    // render — Director Call + this poll + download + R2 upload — fits
    // inside the render-variants 300s function budget. A Kling task
    // slower than this returns null → caller falls back to Ken Burns.
    const maxAttempts = 42;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollRes = await fetch(`${API_BASE}/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status = pollData.data?.task_status;

      if (status === "succeed") {
        const videoUrl = pollData.data?.task_result?.videos?.[0]?.url;
        if (!videoUrl) return null;

        // Download and upload to R2
        const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
        if (!videoRes.ok) return null;

        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        const fname = seoFilename(prompt.slice(0, 40) || "video", "mp4");
        const key = `sites/${siteId}/media/${fname}`;
        const r2Url = await uploadBufferToR2(key, videoBuffer, "video/mp4");

        return {
          url: r2Url,
          duration: parseInt(duration, 10),
        };
      }

      if (status === "failed") {
        console.warn("Kling task failed:", pollData.data?.task_status_msg);
        return null;
      }

      // Still processing — continue polling
    }

    console.warn("Kling task timed out (~3.5 min poll cap) — caller falls back");
    return null;
  } catch (err) {
    console.warn("Kling video gen error:", err instanceof Error ? err.message : err);
    return null;
  }
}
