/**
 * Face detection — pixel-level only, no identification.
 *
 * Resurrected 2026-05-19 as a detection-only helper. The prior version
 * (retired with the personas entity) also did indexFace + searchFaces
 * against a per-site biometric collection to identify WHO was in each
 * frame. That capability is gone. We never want to know whose face is
 * in the asset; we only want to know that faces ARE in the asset, so
 * the privacy pipeline can blur/box/suppress per the subscriber's
 * site-level face policy.
 *
 * Pure DetectFaces call. No biometric collection. No GDPR/BIPA
 * exposure. Just bounding boxes + confidence.
 *
 * Attributes: 'DEFAULT' only (bounding box + confidence). We
 * deliberately do NOT request 'ALL' — that returns age/gender/emotion/
 * pose, which are sensitive inferences we have no use for and no
 * reason to surface to AWS for our own pipeline.
 *
 * Cost: ~$0.001 per image. Used at upload time (one-time-per-asset)
 * and never re-run on re-analysis — face presence is a pixel fact, not
 * an interpretation that changes with new transcripts.
 *
 * AI-generated assets are skipped upstream (see /api/assets POST and
 * the helper below) — synthetic faces aren't real-person likenesses,
 * so the privacy policy has nothing to protect against.
 */
import "server-only";
import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export interface DetectedFace {
  /** Normalized bounding box [0..1]. Renderer scales to any output size. */
  box: { x: number; y: number; w: number; h: number };
  /** Detection confidence 0..1. Subscriber-facing UI may filter weak hits. */
  confidence: number;
}

export interface FaceDetectionResult {
  face_count: number;
  faces: DetectedFace[];
  detected_at: string;
  provider: "aws-rekognition-detect";
}

/**
 * Detect faces in an image URL. Returns empty array on failure — never
 * throws (callers treat absent metadata as "unknown — apply policy
 * fallback"). Logs the error for observability.
 */
export async function detectFaces(imageUrl: string): Promise<FaceDetectionResult> {
  const result: FaceDetectionResult = {
    face_count: 0,
    faces: [],
    detected_at: new Date().toISOString(),
    provider: "aws-rekognition-detect",
  };

  if (!imageUrl) return result;

  try {
    // Fetch image bytes — Rekognition accepts S3 refs or raw bytes;
    // we pass raw bytes since our assets live on R2, not S3.
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`face-detect: fetch failed for ${imageUrl} (${res.status})`);
      return result;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const command = new DetectFacesCommand({
      Image: { Bytes: buf },
      Attributes: ["DEFAULT"],
    });

    const response = await rekognition.send(command);
    const details = response.FaceDetails || [];

    result.face_count = details.length;
    result.faces = details
      .map((face) => {
        const bbox = face.BoundingBox;
        if (
          bbox == null ||
          bbox.Left == null ||
          bbox.Top == null ||
          bbox.Width == null ||
          bbox.Height == null
        ) {
          return null;
        }
        return {
          box: {
            x: bbox.Left,
            y: bbox.Top,
            w: bbox.Width,
            h: bbox.Height,
          },
          // Rekognition returns 0-100; normalize to 0-1 for downstream consumers
          confidence: (face.Confidence || 0) / 100,
        };
      })
      .filter((f): f is DetectedFace => f !== null);

    return result;
  } catch (err) {
    console.warn(
      `face-detect: detection failed for ${imageUrl}:`,
      err instanceof Error ? err.message : err,
    );
    return result;
  }
}

/**
 * Predicate: should this asset get face detection at all?
 *
 * Returns false for AI-generated content (subscriber-declared or C2PA-
 * verified per #161) because synthetic faces aren't real-person
 * likenesses — the privacy framework has nothing to protect against.
 *
 * Trust the declaration model (matches the existing AI disclosure
 * trust posture for platform compliance flags). If subscriber labels
 * an AI-modified real photo as ai_generated, that's their declaration;
 * edge case is their responsibility.
 */
export function shouldDetectFaces(asset: {
  media_type: string;
  metadata: Record<string, unknown> | null;
}): boolean {
  // Only image assets in v1 — video detection works only on the poster
  // frame, which is a misleading partial signal (faces move). Defer to
  // piece 4 when we handle the variant render side.
  if (!asset.media_type?.startsWith("image")) return false;

  // Skip AI-generated content — no real-person likeness to protect
  const aiGenerated = (asset.metadata as Record<string, unknown> | null)?.ai_generated;
  if (aiGenerated === true) return false;

  return true;
}
