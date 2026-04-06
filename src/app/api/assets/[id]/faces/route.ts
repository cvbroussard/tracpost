import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/assets/:id/faces — Get detected faces for an asset.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const [asset] = await sql`
    SELECT metadata->'faces' AS faces FROM media_assets WHERE id = ${id}
  `;

  return NextResponse.json({ faces: asset?.faces || null });
}

/**
 * POST /api/assets/:id/faces — Name an unknown face (assign to persona).
 * Body: { faceIndex: number, personaId?: string, newPersonaName?: string, personaType?: string }
 *
 * If personaId is provided, assigns the face to an existing persona and stores the embedding.
 * If newPersonaName is provided, creates a new persona with the face embedding.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const body = await req.json();
  const { faceIndex, personaId, newPersonaName, personaType } = body;

  if (faceIndex === undefined) {
    return NextResponse.json({ error: "faceIndex required" }, { status: 400 });
  }

  // Get the asset and its face data
  const [asset] = await sql`
    SELECT site_id, metadata FROM media_assets WHERE id = ${id}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const meta = (asset.metadata || {}) as Record<string, unknown>;
  const faceData = meta.faces as { faces: Array<Record<string, unknown>> } | undefined;
  if (!faceData?.faces?.[faceIndex]) {
    return NextResponse.json({ error: "Face not found at index" }, { status: 404 });
  }

  const face = faceData.faces[faceIndex];
  const embedding = face.embedding as number[];
  if (!embedding || embedding.length === 0) {
    return NextResponse.json({ error: "No embedding for this face" }, { status: 400 });
  }

  const siteId = asset.site_id as string;
  let targetPersonaId = personaId;

  // Get asset storage URL for Rekognition indexing
  const [assetFull] = await sql`SELECT storage_url FROM media_assets WHERE id = ${id}`;
  const imageUrl = assetFull?.storage_url as string;

  // Create new persona if needed
  if (!targetPersonaId && newPersonaName) {
    const slug = newPersonaName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);

    const [newPersona] = await sql`
      INSERT INTO personas (site_id, name, slug, type, consent_given)
      VALUES (${siteId}, ${newPersonaName.trim()}, ${slug}, ${personaType || "person"}, false)
      ON CONFLICT (site_id, slug) WHERE slug IS NOT NULL
      DO NOTHING
      RETURNING id, name, slug, type
    `;
    targetPersonaId = newPersona?.id || (await sql`SELECT id FROM personas WHERE site_id = ${siteId} AND slug = ${slug}`)[0]?.id;

    // Index face in Rekognition
    if (targetPersonaId && imageUrl) {
      const { indexFace } = await import("@/lib/face-detect");
      await indexFace(siteId, imageUrl, face.box as { x: number; y: number; width: number; height: number }, targetPersonaId as string).catch((err: unknown) =>
        console.error("Rekognition index failed:", err instanceof Error ? err.message : err)
      );
    }
  } else if (targetPersonaId && imageUrl) {
    // Index face for existing persona
    const { indexFace } = await import("@/lib/face-detect");
    await indexFace(siteId, imageUrl, face.box as { x: number; y: number; width: number; height: number }, targetPersonaId).catch((err: unknown) =>
      console.error("Rekognition index failed:", err instanceof Error ? err.message : err)
    );
  }

  if (!targetPersonaId) {
    return NextResponse.json({ error: "personaId or newPersonaName required" }, { status: 400 });
  }

  // Auto-tag this asset
  await sql`
    INSERT INTO asset_personas (asset_id, persona_id)
    VALUES (${id}, ${targetPersonaId})
    ON CONFLICT DO NOTHING
  `;

  // Update the face data to record the assignment
  faceData.faces[faceIndex].personaId = targetPersonaId;
  faceData.faces[faceIndex].personaName = newPersonaName || null;
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ faces: faceData })}::jsonb
    WHERE id = ${id}
  `;

  return NextResponse.json({
    personaId: targetPersonaId,
    tagged: true,
  });
}
