/**
 * Gemini (Veo) video generation client.
 *
 * Image-to-video via the Gemini API's Veo model — the Google-side
 * counterpart to the Kling producer. Same contract as kling.ts's
 * generateVideoFromImage: the source still becomes the first frame, the
 * prompt drives the motion, the result lands in R2.
 *
 * Auth: GOOGLE_AI_API_KEY — the same key as image-gen/gemini.ts. ("Gemini"
 * is the API surface; Veo is the model that actually renders video.)
 */

import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import { cdnImageCroppedToAspect } from "@/lib/cdn-image";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Veo model — env-overridable so a version bump (e.g. 3.0 → 3.0-fast or a
// newer release) is a config change, not a code deploy (mirrors
// KLING_MODEL_NAME). Default is the current image-to-video Veo 3.
const VEO_MODEL = process.env.GEMINI_VIDEO_MODEL || "veo-3.0-generate-001";

interface VeoVideo {
  url: string;
  duration: number;
}

/** Safe nested lookup — Veo's done-operation shape varies by version. */
function dig(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[String(k)];
  }
  return cur;
}

function firstString(obj: unknown, paths: (string | number)[][]): string | null {
  for (const p of paths) {
    const v = dig(obj, p);
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/**
 * Generate a video from a still image using Gemini's Veo model.
 * The input image becomes the first frame — scene fidelity preserved.
 *
 * @param imageUrl    - URL of the source image (R2 or external)
 * @param prompt      - Motion/action prompt (camera move, mood)
 * @param siteId      - owning site; scopes the R2 key
 * @param options     - aspectRatio: "16:9" | "9:16"
 * @returns the R2 URL + duration, or null on any failure (caller decides)
 */
export async function generateVideoFromImageVeo(
  imageUrl: string,
  prompt: string,
  siteId: string,
  options: { aspectRatio?: "16:9" | "9:16" } = {},
): Promise<VeoVideo | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_AI_API_KEY not set — skipping Veo video generation");
    return null;
  }

  const { aspectRatio = "9:16" } = options;

  try {
    // Veo takes the source image inline as base64. Fetch a CDN-cropped
    // JPEG at the requested aspect — pre-cropping the source eliminates
    // Veo's "landscape source letterboxed inside a 9:16 canvas" outcome
    // by ensuring source.aspect == output.aspect from the start.
    let imgBuffer: Buffer;
    try {
      const imgRes = await fetch(cdnImageCroppedToAspect(imageUrl, aspectRatio));
      if (!imgRes.ok) {
        console.warn("Veo: source image fetch failed:", imgRes.status);
        return null;
      }
      imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    } catch (err) {
      console.warn(
        "Veo: failed to fetch source image:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }

    // Hop A — start the long-running generation operation.
    const startRes = await fetch(
      `${API_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [
            {
              prompt,
              image: {
                bytesBase64Encoded: imgBuffer.toString("base64"),
                mimeType: "image/jpeg",
              },
            },
          ],
          parameters: { aspectRatio },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!startRes.ok) {
      const err = await startRes.text();
      console.warn("Veo start failed:", startRes.status, err.slice(0, 300));
      return null;
    }

    const startData = await startRes.json();
    const operationName: string | undefined = startData.name;
    if (!operationName) {
      console.warn("Veo returned no operation name");
      return null;
    }

    // Hop B — poll the operation. Capped at ~3.6 min so the whole route
    // (gatherDirectorContext + render + download + R2 upload) stays inside
    // the 300s function budget. On the render path the Director Call is
    // skipped, so the poll owns most of that budget.
    const maxAttempts = 44;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollRes = await fetch(`${API_BASE}/${operationName}?key=${apiKey}`);
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      if (!pollData.done) continue;

      if (pollData.error) {
        console.warn(
          "Veo operation failed:",
          JSON.stringify(pollData.error).slice(0, 300),
        );
        return null;
      }

      const response = pollData.response;
      // Prefer inline bytes; fall back to a Files-API URI (needs the key).
      const inlineBytes = firstString(response, [
        ["generateVideoResponse", "generatedSamples", 0, "video", "bytesBase64Encoded"],
        ["generatedVideos", 0, "video", "bytesBase64Encoded"],
        ["generateVideoResponse", "generatedSamples", 0, "video", "videoBytes"],
      ]);
      const videoUri = firstString(response, [
        ["generateVideoResponse", "generatedSamples", 0, "video", "uri"],
        ["generatedVideos", 0, "video", "uri"],
        ["generateVideoResponse", "generatedVideos", 0, "video", "uri"],
      ]);

      let videoBuffer: Buffer | null = null;
      if (inlineBytes) {
        videoBuffer = Buffer.from(inlineBytes, "base64");
      } else if (videoUri) {
        const dlUrl = videoUri.includes("key=")
          ? videoUri
          : `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${apiKey}`;
        const videoRes = await fetch(dlUrl, { signal: AbortSignal.timeout(60000) });
        if (!videoRes.ok) {
          console.warn("Veo video download failed:", videoRes.status);
          return null;
        }
        videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      }

      if (!videoBuffer) {
        console.warn("Veo operation done but no video found in response");
        return null;
      }

      const fname = seoFilename(prompt.slice(0, 40) || "video", "mp4");
      const key = `sites/${siteId}/media/${fname}`;
      const r2Url = await uploadBufferToR2(key, videoBuffer, "video/mp4");

      // Veo 3 clips run ~8s; the API does not honor an arbitrary length.
      return { url: r2Url, duration: 8 };
    }

    console.warn("Veo operation timed out (~3.6 min poll cap) — caller falls back");
    return null;
  } catch (err) {
    console.warn("Veo video gen error:", err instanceof Error ? err.message : err);
    return null;
  }
}
