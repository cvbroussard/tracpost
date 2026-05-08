import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { parseContextNote } from "@/lib/context-note-parser";
import { deleteObjectFromR2, keyFromStorageUrl } from "@/lib/r2";
import { purgeCdnCache } from "@/lib/cdn";
import { waitUntil } from "@vercel/functions";

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
    const { context_note, pillar, content_tags, vendor_ids, brand_ids, project_ids, persona_ids, location_ids, ai_verifications } = body;

    if (context_note === undefined && pillar === undefined && content_tags === undefined && vendor_ids === undefined && brand_ids === undefined && project_ids === undefined && persona_ids === undefined && location_ids === undefined && ai_verifications === undefined) {
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

    // AI verification confirm/reject (#167). Subscribers explicitly accept
    // or reject AI's suggestions (scene_type, content_pillar). Confirmed
    // values feed Brand DNA signal stronger than auto-applied; rejected
    // values get downweighted in future generations. No model retraining
    // happens here — the log is the signal store.
    if (Array.isArray(ai_verifications) && ai_verifications.length > 0) {
      const existing = (currentMeta.ai_verifications as Array<Record<string, unknown>>) || [];
      const merged = [...existing];
      for (const v of ai_verifications) {
        if (!v || typeof v !== "object") continue;
        const field = v.field as string;
        const status = v.status as string;
        if (!field || !["confirmed", "rejected"].includes(status)) continue;
        const idx = merged.findIndex((m) => m.field === field);
        const entry = {
          field,
          value: v.value ?? null,
          status,
          verified_at: new Date().toISOString(),
          verified_by: auth.subscriptionId,
        };
        if (idx >= 0) merged[idx] = entry;
        else merged.push(entry);
      }
      await sql`
        UPDATE media_assets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ ai_verifications: merged })}::jsonb
        WHERE id = ${id}
      `;
    }

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

    // Briefing flip: if asset is in 'pending_briefing' and now has a
    // substantive context_note (>= 40 chars per the readiness primitive
    // floor), promote to 'triaged'. This is the human-briefing action
    // that gates orchestrator pool entry per migrate-099. A subscriber
    // saving a thin or empty caption keeps the asset in pending_briefing.
    const [latest] = await sql`
      SELECT triage_status, context_note FROM media_assets WHERE id = ${id}
    `;
    if (latest?.triage_status === "pending_briefing") {
      const note = (latest.context_note as string) || "";
      if (note.trim().length >= 40) {
        await sql`
          UPDATE media_assets
          SET triage_status = 'triaged',
              triaged_at = COALESCE(triaged_at, NOW()),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'briefed_at', NOW()::text,
                'briefed_by_subscription_id', ${auth.subscriptionId}
              )
          WHERE id = ${id} AND triage_status = 'pending_briefing'
        `;

        // Render ALL applicable templates eagerly on briefing flip. Per
        // project_tracpost_render_format_default.md + the eager-cheap policy,
        // every connected-platform variant should be ready by the time the
        // orchestrator picks or Compose loads — so subscriber Compose Review
        // shows the actual file that will publish.
        //
        // Real ffmpeg/sharp rendering takes 5-30 seconds for the full set —
        // waitUntil so the briefing-save response returns immediately and
        // renders continue on the serverless instance until completion.
        // Render failures don't block the response.
        waitUntil(
          (async () => {
            try {
              const { renderAllVariantsForAsset } = await import("@/lib/pipeline/variant-render");
              await renderAllVariantsForAsset(id);
            } catch (err) {
              console.warn(
                "Variant render failed (non-fatal — asset still briefed):",
                err instanceof Error ? err.message : err,
              );
            }
          })(),
        );
      }
    }

    // Update caption source and project snapshot if this is a project asset
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

          // Update project snapshot (improves future AI generations)
          const { onCaptionSaved } = await import("@/lib/pipeline/project-captions");
          await onCaptionSaved(id, link.project_id as string, wasAiGenerated, previousCaption || null);
        }
      } catch (err) {
        console.error("Project caption pipeline error:", err instanceof Error ? err.message : err);
      }
    }

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

  const [asset] = await sql`
    SELECT ma.id, ma.storage_url
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Referenced assets cannot be deleted — the tenant must upload a
  // replacement via /api/assets/:id/replace, which overwrites the
  // R2 object in place so every URL reference keeps working.
  const refs = await sql`
    SELECT id, title, status FROM blog_posts WHERE source_asset_id = ${id}
  `;

  if (refs.length > 0) {
    return NextResponse.json({
      error: "Asset is used in blog posts — upload a replacement instead",
      posts: refs.map((r) => ({ id: r.id, title: r.title, status: r.status })),
      requiresReplace: true,
    }, { status: 409 });
  }

  // Unreferenced asset — full teardown including R2 blob.
  await sql`DELETE FROM asset_brands    WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_projects  WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_personas  WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_locations WHERE asset_id = ${id}`;
  await sql`DELETE FROM asset_services  WHERE asset_id = ${id}`;
  await sql`DELETE FROM media_assets    WHERE id       = ${id}`;

  const storageUrl = asset.storage_url ? String(asset.storage_url) : null;
  const key = storageUrl ? keyFromStorageUrl(storageUrl) : null;
  if (key) {
    try {
      await deleteObjectFromR2(key);
    } catch (err) {
      console.error("R2 delete failed (DB delete succeeded):", err);
    }
  }
  if (storageUrl) {
    await purgeCdnCache([storageUrl]);
  }

  return NextResponse.json({ success: true });
}
