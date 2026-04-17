import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/assets/:id/video
 *
 * Create video content from a photo asset or its project.
 *
 * Body:
 *   { type: "ken_burns" }               → Ken Burns from this + sibling project photos
 *   { type: "timelapse" }               → Timelapse from project photos
 *   { type: "reformat", aspect: "9:16" } → Reformat existing video
 *   { type: "thumbnail" }               → Extract thumbnail from video
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${assetId} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body.type || "ken_burns";
  const siteId = asset.site_id as string;

  try {
    if (type === "ken_burns") {
      // Get project photos for this asset
      const [link] = await sql`
        SELECT project_id FROM asset_projects WHERE asset_id = ${assetId} LIMIT 1
      `;

      let imageUrls: string[];
      if (link?.project_id) {
        const photos = await sql`
          SELECT storage_url FROM media_assets ma
          JOIN asset_projects ap ON ap.asset_id = ma.id
          WHERE ap.project_id = ${link.project_id}
            AND ma.media_type LIKE 'image%'
            AND ma.quality_score >= 0.5
          ORDER BY ma.quality_score DESC
          LIMIT 5
        `;
        imageUrls = photos.map((p) => String(p.storage_url));
      } else {
        imageUrls = [String(asset.storage_url)];
      }

      if (imageUrls.length === 0) {
        return NextResponse.json({ error: "No photos available" }, { status: 400 });
      }

      const { createKenBurnsVideo } = await import("@/lib/render/video");
      const url = await createKenBurnsVideo({
        imageUrls,
        siteId,
        outputAspect: body.aspect || "9:16",
      });

      return NextResponse.json({ success: true, type: "ken_burns", url });
    }

    if (type === "timelapse") {
      const [link] = await sql`
        SELECT project_id FROM asset_projects WHERE asset_id = ${assetId} LIMIT 1
      `;
      if (!link?.project_id) {
        return NextResponse.json({ error: "Asset not linked to a project" }, { status: 400 });
      }

      const photos = await sql`
        SELECT storage_url FROM media_assets ma
        JOIN asset_projects ap ON ap.asset_id = ma.id
        WHERE ap.project_id = ${link.project_id}
          AND ma.media_type LIKE 'image%'
        ORDER BY ma.date_taken ASC NULLS LAST, ma.created_at ASC
      `;

      if (photos.length < 3) {
        return NextResponse.json({ error: "Need at least 3 photos for timelapse" }, { status: 400 });
      }

      const { createTimelapse } = await import("@/lib/render/video");
      const url = await createTimelapse({
        imageUrls: photos.map((p) => String(p.storage_url)),
        siteId,
        outputAspect: body.aspect || "9:16",
        fps: body.fps || 4,
      });

      return NextResponse.json({ success: true, type: "timelapse", url });
    }

    if (type === "reformat") {
      if (!(asset.media_type as string)?.startsWith("video")) {
        return NextResponse.json({ error: "Asset is not a video" }, { status: 400 });
      }

      const { reformatVideo } = await import("@/lib/render/video");
      const url = await reformatVideo({
        videoUrl: String(asset.storage_url),
        targetAspect: body.aspect || "9:16",
        siteId,
      });

      return NextResponse.json({ success: true, type: "reformat", url });
    }

    if (type === "thumbnail") {
      if (!(asset.media_type as string)?.startsWith("video")) {
        return NextResponse.json({ error: "Asset is not a video" }, { status: 400 });
      }

      const { generateThumbnail } = await import("@/lib/render/video");
      const url = await generateThumbnail(String(asset.storage_url), siteId);

      return NextResponse.json({ success: true, type: "thumbnail", url });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
