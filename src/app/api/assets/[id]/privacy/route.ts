import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { resolveFacePolicy } from "@/lib/privacy/face-transforms";

export const runtime = "nodejs";

/**
 * Privacy state for a single asset.
 *
 * Surfaces what the modal's Privacy section needs to render:
 *   - The asset's face_detection metadata (count + boxes + provider +
 *     per-face age range / is_potential_minor)
 *   - The site's stored adult + minor face policies + waiver state
 *   - The EFFECTIVE policy after each waiver gate (matches what the
 *     variant renderer applies)
 *   - media_type and ai_generated for the "skipped" scenarios
 *
 * Read-only. Per-asset overrides are deferred from v1 — subscribers
 * change policy via /dashboard/business/content-safeguards (applies to
 * all their assets).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [row] = await sql`
    SELECT ma.id, ma.site_id, ma.media_type, ma.metadata,
           s.face_policy, s.face_waiver_signed_at, s.face_waiver_version,
           s.minor_face_policy, s.minor_face_waiver_signed_at, s.minor_face_waiver_version
    FROM media_assets ma JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;
  if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === row.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const metadata = (row.metadata as Record<string, unknown> | null) || {};
  const faceDetection = metadata.face_detection as
    | {
        face_count?: number;
        faces?: Array<{
          confidence?: number;
          is_potential_minor?: boolean;
          age_low?: number;
          age_high?: number;
        }>;
        detected_at?: string;
        provider?: string;
      }
    | undefined;
  const aiGenerated = (metadata.ai_generated as boolean) === true;
  const storedPolicy = (row.face_policy as string) || "blur";
  const waiverSignedAt = (row.face_waiver_signed_at as Date | string | null) || null;
  const storedMinorPolicy = (row.minor_face_policy as string) || "blur";
  const minorWaiverSignedAt =
    (row.minor_face_waiver_signed_at as Date | string | null) || null;

  // Pre-compute per-asset face breakdown so the modal doesn't have to
  // re-derive it. Legacy detections (pre-2026-05-19) lack
  // is_potential_minor — those count as adult here, matching the
  // renderer's conservative fallback.
  const strongFaces = (faceDetection?.faces || []).filter(
    (f) => (f.confidence ?? 0) >= 0.5,
  );
  const minorFaceCount = strongFaces.filter((f) => f.is_potential_minor === true).length;
  const adultFaceCount = strongFaces.length - minorFaceCount;

  return NextResponse.json({
    media_type: row.media_type as string,
    ai_generated: aiGenerated,
    face_detection: faceDetection || null,
    adult_face_count: adultFaceCount,
    minor_face_count: minorFaceCount,
    site_face_policy: storedPolicy,
    site_face_waiver_signed_at: waiverSignedAt,
    site_face_waiver_version: (row.face_waiver_version as string | null) || null,
    site_minor_face_policy: storedMinorPolicy,
    site_minor_face_waiver_signed_at: minorWaiverSignedAt,
    site_minor_face_waiver_version: (row.minor_face_waiver_version as string | null) || null,
    effective_face_policy: resolveFacePolicy(storedPolicy, waiverSignedAt),
    effective_minor_face_policy: resolveFacePolicy(storedMinorPolicy, minorWaiverSignedAt),
  });
}
