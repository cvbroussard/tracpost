import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { resolveFacePolicy } from "@/lib/privacy/face-transforms";

export const runtime = "nodejs";

/**
 * Privacy state for a single asset.
 *
 * Surfaces what the modal's Privacy section needs to render:
 *   - The asset's face_detection metadata (count + boxes + provider)
 *   - The site's stored face_policy + waiver state
 *   - The EFFECTIVE policy after the waiver gate (matches what the
 *     variant renderer applies)
 *   - media_type and ai_generated for the "skipped" scenarios
 *
 * Read-only. Per-asset overrides are deferred from v1 — subscribers
 * change policy via /dashboard/business/privacy, which applies to all
 * their assets.
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
           s.face_policy, s.face_waiver_signed_at, s.face_waiver_version
    FROM media_assets ma JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;
  if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === row.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const metadata = (row.metadata as Record<string, unknown> | null) || {};
  const faceDetection = metadata.face_detection as
    | { face_count?: number; faces?: unknown[]; detected_at?: string; provider?: string }
    | undefined;
  const aiGenerated = (metadata.ai_generated as boolean) === true;
  const storedPolicy = (row.face_policy as string) || "asis";
  const waiverSignedAt = (row.face_waiver_signed_at as Date | string | null) || null;

  return NextResponse.json({
    media_type: row.media_type as string,
    ai_generated: aiGenerated,
    face_detection: faceDetection || null,
    site_face_policy: storedPolicy,
    site_face_waiver_signed_at: waiverSignedAt,
    site_face_waiver_version: (row.face_waiver_version as string | null) || null,
    effective_face_policy: resolveFacePolicy(storedPolicy, waiverSignedAt),
  });
}
