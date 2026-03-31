import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { parseContextNote } from "@/lib/context-note-parser";

/**
 * PATCH /api/assets/:id — Update an asset's context note or pillar.
 *
 * Body: { context_note?, pillar? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  try {
    const body = await req.json();
    const { context_note, pillar, content_tags, vendor_ids } = body;

    if (context_note === undefined && pillar === undefined && content_tags === undefined && vendor_ids === undefined) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    // Verify ownership via site
    const [asset] = await sql`
      SELECT ma.id, ma.site_id, ma.metadata
      FROM media_assets ma
      JOIN sites s ON ma.site_id = s.id
      WHERE ma.id = ${id} AND s.subscriber_id = ${auth.subscriberId}
    `;

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    // Build metadata with pillar override
    const currentMeta =
      typeof asset.metadata === "object" && asset.metadata !== null
        ? (asset.metadata as Record<string, unknown>)
        : {};
    const newMeta = pillar !== undefined ? { ...currentMeta, pillar } : currentMeta;

    // Update fields individually to avoid type coercion issues
    if (context_note !== undefined) {
      await sql`UPDATE media_assets SET context_note = ${context_note} WHERE id = ${id}`;
    }
    if (pillar !== undefined) {
      await sql`UPDATE media_assets SET content_pillar = ${pillar}, metadata = ${JSON.stringify(newMeta)}::jsonb WHERE id = ${id}`;
    }
    if (Array.isArray(content_tags)) {
      await sql`UPDATE media_assets SET content_tags = ${content_tags} WHERE id = ${id}`;
    }
    // Parse hashtags from context note and merge with explicit vendor_ids
    let resolvedVendorIds = Array.isArray(vendor_ids) ? [...vendor_ids] : null;
    if (context_note !== undefined && typeof context_note === "string") {
      const parsed = await parseContextNote(context_note, auth.subscriberId);
      if (parsed.vendorIds.length > 0) {
        const existing = resolvedVendorIds || [];
        const merged = [...new Set([...existing, ...parsed.vendorIds])];
        resolvedVendorIds = merged;
      }
    }

    if (Array.isArray(resolvedVendorIds)) {
      await sql`DELETE FROM asset_vendors WHERE asset_id = ${id}`;
      for (const vendorId of resolvedVendorIds) {
        await sql`INSERT INTO asset_vendors (asset_id, vendor_id) VALUES (${id}, ${vendorId}) ON CONFLICT DO NOTHING`;
      }
    }

    // Log the edit
    await sql`
      INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
      VALUES (${asset.site_id}, 'edit', 'media_asset', ${id}, ${JSON.stringify({
        context_note: context_note !== undefined ? "updated" : undefined,
        pillar: pillar !== undefined ? pillar : undefined,
      })})
    `;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/assets/:id — Delete a media asset.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Verify ownership
  const [asset] = await sql`
    SELECT ma.id
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscriber_id = ${auth.subscriberId}
  `;

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Check if asset is used in blog posts
  const refs = await sql`
    SELECT id, title, status FROM blog_posts WHERE source_asset_id = ${id}
  `;

  const forceDelete = new URL(req.url).searchParams.get("force") === "true";

  if (refs.length > 0 && !forceDelete) {
    return NextResponse.json({
      error: "Asset is used in blog posts",
      posts: refs.map((r) => ({ id: r.id, title: r.title, status: r.status })),
      requiresForce: true,
    }, { status: 409 });
  }

  // Clear references and delete
  await sql`UPDATE blog_posts SET source_asset_id = NULL WHERE source_asset_id = ${id}`;
  await sql`DELETE FROM asset_vendors WHERE asset_id = ${id}`;
  await sql`DELETE FROM media_assets WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}
