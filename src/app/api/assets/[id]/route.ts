import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { parseContextNote } from "@/lib/context-note-parser";
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
    const { context_note, pillar, pillars, scene_types, content_tags, vendor_ids, brand_ids, project_ids, persona_ids, branch_ids, service_ids, ai_verifications, restore, ai_generated } = body;

    if (context_note === undefined && pillar === undefined && pillars === undefined && scene_types === undefined && content_tags === undefined && vendor_ids === undefined && brand_ids === undefined && project_ids === undefined && persona_ids === undefined && branch_ids === undefined && service_ids === undefined && ai_verifications === undefined && restore === undefined && ai_generated === undefined) {
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

    // AI-generated declaration update (subscriber-controlled). Per #161,
    // subscriber declaration is the canonical signal except where C2PA
    // manifest detection (set at upload) overrides. When subscriber edits
    // here, treat as a deliberate declaration and stamp ai_flag_source.
    if (typeof ai_generated === "boolean") {
      await sql`
        UPDATE media_assets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          ai_generated: ai_generated,
          ai_flag_source: "subscriber_declared",
          ai_flag_set_at: new Date().toISOString(),
        })}::jsonb
        WHERE id = ${id}
      `;
    }

    // Restore from archive (per project_tracpost_deletion_policy.md). Clears
    // archived_at; asset reappears in library + orchestrator pool. Logged
    // for audit alongside other state-change actions.
    if (restore === true) {
      await sql`
        UPDATE media_assets
        SET archived_at = NULL, updated_at = NOW()
        WHERE id = ${id}
      `;
      try {
        await sql`
          INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
          VALUES (${asset.site_id}, 'restore', 'media_asset', ${id}, '{}'::jsonb)
        `;
      } catch { /* non-fatal */ }
    }

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
    // pillar / pillars body params now NO-OPS (LOCKED 2026-05-09).
    // Pillars are derived from content_tags + sites.pillar_config at read
    // time; nothing is stored on the asset for pillar membership. We accept
    // the params silently (so legacy callers don't break) but never write.
    // Suppress unused-warnings:
    void pillar; void pillars; void newMeta;
    // Subscriber-controlled scene composition array (Scene Composition column).
    // Validated against the platform-wide registry on the client side; we
    // accept whatever they send because a write is always more current than
    // whatever the AI guessed.
    if (Array.isArray(scene_types)) {
      await sql`UPDATE media_assets SET scene_types = ${scene_types} WHERE id = ${id}`;
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
    if (Array.isArray(branch_ids)) {
      await sql`DELETE FROM asset_branches WHERE asset_id = ${id}`;
      for (const branchId of branch_ids) {
        await sql`INSERT INTO asset_branches (asset_id, branch_id) VALUES (${id}, ${branchId}) ON CONFLICT DO NOTHING`;
      }
    }
    if (Array.isArray(service_ids)) {
      await sql`DELETE FROM asset_services WHERE asset_id = ${id}`;
      for (const serviceId of service_ids) {
        await sql`INSERT INTO asset_services (asset_id, service_id) VALUES (${id}, ${serviceId}) ON CONFLICT DO NOTHING`;
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
              // processBriefedAsset orchestrates the full briefing-flip pipeline:
              // vision triage with full context → AI returns url_slug → source rename
              // → poster gen with derived key (videos) → cascade-delete old variants →
              // render all variants with slug-derived keys.
              const { processBriefedAsset } = await import("@/lib/pipeline/process-briefed-asset");
              await processBriefedAsset(id);
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
 * DELETE /api/assets/:id — soft-archive (NOT hard-delete) a media asset.
 *
 * Per project_tracpost_deletion_policy.md (LOCKED 2026-05-08):
 * subscribers cannot hard-delete. Sets archived_at = NOW(); the asset
 * disappears from library + orchestrator pool + Compose pickers but
 * stays in DB + R2. Restorable via PATCH (clears archived_at).
 *
 * Hard-delete only happens at subscription cancellation + retention
 * expiry — separate operator-only wipe job, not exposed via this endpoint.
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
    SELECT ma.id
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  await sql`
    UPDATE media_assets
    SET archived_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
  `;

  // Log the archive action so operators can trace subscriber library
  // state changes over time.
  try {
    await sql`
      INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
      SELECT site_id, 'archive', 'media_asset', ${id}, '{}'::jsonb
      FROM media_assets WHERE id = ${id}
    `;
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, archived: true });
}
