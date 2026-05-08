import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import { readC2paManifest } from "@/lib/c2pa/reader";

/**
 * POST /api/assets — Register a new media asset.
 *
 * Does the minimum: validate, re-host external URLs, convert HEIC, create DB row.
 * All heavy processing (EXIF, triage, geo-match, project tagging) is deferred
 * to the pipeline cron. Browser can close immediately after this returns.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { site_id, media_type, context_note, project_id } = body;
    const storage_url = body.storage_url || body.url;
    // Subscriber-declared AI-generated flag (per #161 Phase 1).
    // Defaults to false. Used downstream by #160 disclosure pipeline.
    // Phase 2 (C2PA reader) will override this to true if a manifest
    // declares AI provenance, regardless of subscriber's toggle state.
    const aiGeneratedDeclared = body.ai_generated === true;

    if (!site_id || !storage_url || !media_type) {
      return NextResponse.json(
        { error: "site_id, storage_url, and media_type are required" },
        { status: 400 }
      );
    }

    // Verify site ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Re-host external URLs to R2
    let finalUrl = storage_url;
    if (storage_url && !storage_url.includes("assets.tracpost.com") && media_type === "image") {
      try {
        const imgRes = await fetch(storage_url, { signal: AbortSignal.timeout(15000) });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const fname = seoFilename(context_note || "product-image", ext);
          const key = `sites/${site_id}/media/${fname}`;
          finalUrl = await uploadBufferToR2(key, buffer, contentType);
        }
      } catch (err) {
        console.warn("External image re-host failed, using original URL:", err instanceof Error ? err.message : err);
      }
    }

    // PDF handling — extract page thumbnails, don't create a single asset
    const isPdf = finalUrl && (finalUrl.endsWith(".pdf") || media_type === "application/pdf");
    if (isPdf) {
      try {
        const { processPdf } = await import("@/lib/pdf-process");
        const assetIds = await processPdf(finalUrl, site_id, project_id || null, context_note || null);

        await sql`
          INSERT INTO usage_log (subscription_id, site_id, action, metadata)
          VALUES (${auth.subscriptionId}, ${site_id}, 'pdf_upload', ${JSON.stringify({
            pdf_url: finalUrl,
            pages: assetIds.length,
          })})
        `;

        return NextResponse.json({
          asset: { id: assetIds[0], site_id, storage_url: finalUrl, media_type: "application/pdf" },
          pages: assetIds.length,
          page_asset_ids: assetIds,
        }, { status: 201 });
      } catch (err) {
        console.error("PDF processing failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "PDF processing failed" }, { status: 500 });
      }
    }

    // Flag HEIC/HEIF for deferred conversion by the cron
    const isHeic = finalUrl && (finalUrl.endsWith(".heic") || finalUrl.endsWith(".heif"));

    // C2PA manifest detection (Phase 2 of #161). Free, deterministic;
    // catches AI-generated content from well-behaved generators (Firefly,
    // OpenAI, Imagen, Midjourney, etc.). Manifest absence isn't proof of
    // human capture — subscriber declaration carries the rest.
    // Skip for HEIC pending conversion (cron will handle), and for non-
    // image/video media types (PDFs handled separately above).
    let c2paResult: Awaited<ReturnType<typeof readC2paManifest>> = null;
    if (!isHeic && (media_type === "image" || media_type === "video" || media_type.startsWith("image/") || media_type.startsWith("video/"))) {
      c2paResult = await readC2paManifest(finalUrl, media_type).catch(() => null);
    }

    // C2PA wins over subscriber declaration when it positively identifies AI:
    // a tamper-resistant manifest declaring AI source is more reliable than
    // a self-reported toggle. Subscriber's NO doesn't override a manifest YES.
    // Subscriber's YES still wins over manifest absence (silence ≠ refutation).
    const aiGeneratedFinal = c2paResult?.isAiGenerated || aiGeneratedDeclared;
    const aiFlagSource = c2paResult?.isAiGenerated
      ? "c2pa_manifest"
      : aiGeneratedDeclared
      ? "subscriber_declared"
      : "default_false";

    // Build metadata — include deferred processing hints
    const assetMeta: Record<string, unknown> = {
      ...(body.metadata || {}),
      ...(isHeic && { needs_conversion: true }),
      ...(project_id && { pending_project_id: project_id }),
      original_filename: storage_url.split("/").pop()?.split("?")[0] || null,
      // AI-generated flag (#161): C2PA manifest takes priority over subscriber declaration.
      ai_generated: aiGeneratedFinal,
      ai_flag_source: aiFlagSource,
      ai_flag_set_at: new Date().toISOString(),
      // Store full C2PA manifest for audit when present
      ...(c2paResult && { c2pa_manifest: c2paResult.raw, c2pa_claim_generator: c2paResult.claimGenerator }),
    };

    const [asset] = await sql`
      INSERT INTO media_assets (
        site_id, storage_url, media_type, context_note,
        source, triage_status, metadata, sort_order
      )
      VALUES (
        ${site_id}, ${finalUrl}, ${media_type},
        ${context_note || null}, 'upload', 'pending_briefing',
        ${JSON.stringify(assetMeta)}, EXTRACT(EPOCH FROM NOW())
      )
      RETURNING id, site_id, storage_url, media_type, context_note, triage_status, created_at
    `;

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, site_id, action, metadata)
      VALUES (${auth.subscriptionId}, ${site_id}, 'asset_upload', ${JSON.stringify({
        asset_id: asset.id,
        media_type,
      })})
    `;

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/assets?site_id=xxx&status=received
 * List assets, optionally filtered.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id");
  const status = url.searchParams.get("status");

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${siteId} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const assets = status
    ? await sql`
        SELECT id, storage_url, media_type, context_note, triage_status, quality_score, created_at
        FROM media_assets WHERE site_id = ${siteId} AND triage_status = ${status}
        ORDER BY created_at DESC LIMIT 100
      `
    : await sql`
        SELECT id, storage_url, media_type, context_note, triage_status, quality_score, created_at
        FROM media_assets WHERE site_id = ${siteId}
        ORDER BY created_at DESC LIMIT 100
      `;

  return NextResponse.json({ assets });
}
