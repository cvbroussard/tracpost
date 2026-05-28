import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { detectFaces } from "@/lib/face-detect";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Manual face detection trigger for the asset modal Privacy section.
 *
 * Why this exists: piece 2 fires detection on NEW uploads only. Legacy
 * assets (uploaded before the privacy pipeline shipped) have no
 * face_detection metadata. Subscribers process these manually as they
 * touch each asset — clicking "Run face detection" in the modal fills
 * in the metadata for that one asset, so the Privacy section can
 * report what the variant render will do.
 *
 * Synchronous: AWS Rekognition takes 1-3s; subscriber is actively
 * engaged so we wait and return the result. Idempotent — re-running
 * on an asset that already has metadata just overwrites with the
 * fresh result.
 *
 * Skip rules mirror upload-time gating: images only, not HEIC, not
 * AI-generated. Returns a structured error explaining the skip when
 * the asset doesn't qualify.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT id, business_id, storage_url, media_type, metadata
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const mediaType = (asset.media_type as string) || "";
  const metadata = (asset.metadata as Record<string, unknown> | null) || {};
  const aiGenerated = (metadata.ai_generated as boolean) === true;

  if (!mediaType.toLowerCase().startsWith("image")) {
    return NextResponse.json(
      { error: "Face detection only runs on image assets", skipped: true, reason: "not_image" },
      { status: 400 },
    );
  }
  if (aiGenerated) {
    return NextResponse.json(
      { error: "Face detection skipped — AI-generated content has no real-person likeness", skipped: true, reason: "ai_generated" },
      { status: 400 },
    );
  }

  const sourceUrl = asset.storage_url as string;
  if (!sourceUrl) {
    return NextResponse.json({ error: "Asset has no storage URL" }, { status: 400 });
  }

  const result = await detectFaces(sourceUrl);

  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || ${JSON.stringify({ face_detection: result })}::jsonb,
      updated_at = NOW()
    WHERE id = ${assetId}
  `;

  return NextResponse.json({ ok: true, face_detection: result });
}
