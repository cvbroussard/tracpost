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
    const { context_note, pillar, content_tags, vendor_ids, brand_ids, project_ids, persona_ids, location_ids } = body;

    if (context_note === undefined && pillar === undefined && content_tags === undefined && vendor_ids === undefined && brand_ids === undefined && project_ids === undefined && persona_ids === undefined && location_ids === undefined) {
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
      WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
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
    // Parse hashtags from context note and merge with explicit brand IDs
    // vendor_ids is kept for backward compat — treated as brand IDs
    let resolvedBrandIds = Array.isArray(brand_ids) ? [...brand_ids] : Array.isArray(vendor_ids) ? [...vendor_ids] : null;
    if (context_note !== undefined && typeof context_note === "string") {
      const parsed = await parseContextNote(context_note, asset.site_id as string);
      if (parsed.vendorIds.length > 0) {
        const existing = resolvedBrandIds || [];
        const merged = [...new Set([...existing, ...parsed.vendorIds])];
        resolvedBrandIds = merged;
      }
    }

    if (Array.isArray(resolvedBrandIds)) {
      await sql`DELETE FROM asset_brands WHERE asset_id = ${id}`;
      for (const brandId of resolvedBrandIds) {
        await sql`INSERT INTO asset_brands (asset_id, brand_id) VALUES (${id}, ${brandId}) ON CONFLICT DO NOTHING`;
      }
    }

    // Project, persona, location tagging (separate body fields)
    if (Array.isArray(project_ids)) {
      await sql`DELETE FROM asset_projects WHERE asset_id = ${id}`;
      for (const projectId of project_ids) {
        await sql`INSERT INTO asset_projects (asset_id, project_id) VALUES (${id}, ${projectId}) ON CONFLICT DO NOTHING`;
      }
    }
    if (Array.isArray(persona_ids)) {
      await sql`DELETE FROM asset_personas WHERE asset_id = ${id}`;
      for (const personaId of persona_ids) {
        await sql`INSERT INTO asset_personas (asset_id, persona_id) VALUES (${id}, ${personaId}) ON CONFLICT DO NOTHING`;
      }
    }
    if (Array.isArray(location_ids)) {
      await sql`DELETE FROM asset_locations WHERE asset_id = ${id}`;
      for (const locationId of location_ids) {
        await sql`INSERT INTO asset_locations (asset_id, location_id) VALUES (${id}, ${locationId}) ON CONFLICT DO NOTHING`;
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

    // Trigger progressive caption pipeline if this asset belongs to a project
    let nextDraft: { assetId: string; caption: string } | undefined;
    if (context_note !== undefined && typeof context_note === "string" && context_note.trim()) {
      try {
        const projectLinks = await sql`
          SELECT project_id FROM asset_projects WHERE asset_id = ${id}
        `;
        for (const link of projectLinks) {
          const meta = (asset.metadata || {}) as Record<string, unknown>;
          const wasAiGenerated = meta.caption_source === "ai";
          const previousCaption = meta.ai_caption as string | null;

          // Mark caption source
          if (wasAiGenerated && context_note !== previousCaption) {
            await sql`
              UPDATE media_assets
              SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ caption_source: "corrected" })}::jsonb
              WHERE id = ${id}
            `;
          } else if (!wasAiGenerated) {
            await sql`
              UPDATE media_assets
              SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ caption_source: "manual" })}::jsonb
              WHERE id = ${id}
            `;
          }

          const { onCaptionSaved } = await import("@/lib/pipeline/project-captions");
          const result = await onCaptionSaved(id, link.project_id as string, wasAiGenerated, previousCaption || null);
          if (result.nextDraft) {
            nextDraft = result.nextDraft;
          }
        }
      } catch (err) {
        console.error("Project caption pipeline error:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ success: true, nextDraft });
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
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
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
  await sql`DELETE FROM asset_brands WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_projects WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_personas WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_locations WHERE asset_id = ${id}`;
  await sql`DELETE FROM media_assets WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}
