import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/focal-point/[assetId]
 *
 * On-demand focal-point inspection — the operator playground. Calls the
 * Modal detection service in demand-mode (no stored metadata.detection
 * prerequisite) and returns the result for the inspector modal to render.
 * Once metadata.detection is wired into onboarding (#238) and backfilled
 * (#240), this route can switch to read-stored-first + fall-through-to-Modal.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const detectionUrl = process.env.DETECTION_SERVICE_URL;
  const detectionSecret = process.env.DETECTION_SERVICE_SECRET;
  if (!detectionUrl || !detectionSecret) {
    return NextResponse.json(
      { error: "DETECTION_SERVICE_URL / DETECTION_SERVICE_SECRET not configured in env" },
      { status: 500 },
    );
  }

  const { assetId } = await params;

  const [asset] = await sql`
    SELECT id, storage_url, media_type
    FROM media_assets
    WHERE id = ${assetId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const mediaType = String(asset.media_type || "");
  if (!mediaType.toLowerCase().startsWith("image")) {
    return NextResponse.json(
      { error: "Focal-point detection is stills-only; videos route through Smart Rotate" },
      { status: 400 },
    );
  }

  const wireStart = Date.now();
  let detectionResponse: Response;
  try {
    detectionResponse = await fetch(detectionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Detection-Secret": detectionSecret,
      },
      body: JSON.stringify({ image_url: asset.storage_url }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Detection service unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
  const wireTimeMs = Date.now() - wireStart;

  if (!detectionResponse.ok) {
    const text = await detectionResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `Detection service ${detectionResponse.status}: ${text}` },
      { status: 502 },
    );
  }

  const detection = await detectionResponse.json();

  return NextResponse.json({
    source: {
      assetId: asset.id,
      url: asset.storage_url,
      mediaType: asset.media_type,
    },
    detection,
    wireTimeMs,
  });
}
