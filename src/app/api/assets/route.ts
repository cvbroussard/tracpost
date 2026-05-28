import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";
import { readC2paManifest } from "@/lib/c2pa/reader";
import { waitUntil } from "@vercel/functions";

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
      SELECT id FROM businesses
      WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}
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
          INSERT INTO usage_log (billing_account_id, business_id, action, metadata)
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

    // Briefed-on-upload optimization (#166): when subscriber provides a
    // substantive context_note (≥40 chars per the readiness floor) at upload,
    // skip the 'onboarded' intermediate state and land directly in
    // 'briefed'. Mirrors PATCH-time briefing flip but avoids a follow-up
    // PATCH for the common case of "subscriber types caption then uploads".
    const briefedOnUpload = (context_note || "").trim().length >= 40;
    const initialStatus = briefedOnUpload ? "briefed" : "onboarded";
    const briefedMeta = briefedOnUpload
      ? {
          briefed_at: new Date().toISOString(),
          briefed_by_subscription_id: auth.subscriptionId,
          briefed_at_upload: true,
        }
      : {};

    // briefable_at: stamped at insert unless the bytes are unviewable in
    // a browser. Only HEIC qualifies — browsers can't decode it. Videos
    // (including HEVC .mov from iPhones) render via the <video> element's
    // own first-frame fallback even when our async poster-gen fails (e.g.
    // ffmpeg-static lacks H.265 codec support). Poster is a thumbnail
    // enhancement, not a briefing prerequisite.
    const isVideo = media_type.toLowerCase().startsWith("video");
    const briefableAtInsert = !isHeic ? new Date() : null;

    const [asset] = await sql`
      INSERT INTO media_assets (
        business_id, storage_url, media_type, context_note,
        source, processing_stage, triaged_at, briefable_at,
        metadata, sort_order
      )
      VALUES (
        ${site_id}, ${finalUrl}, ${media_type},
        ${context_note || null}, 'upload', ${initialStatus},
        ${briefedOnUpload ? new Date() : null},
        ${briefableAtInsert},
        ${JSON.stringify({ ...assetMeta, ...briefedMeta })}, EXTRACT(EPOCH FROM NOW())
      )
      RETURNING id, business_id, storage_url, media_type, context_note, processing_stage, briefable_at, created_at
    `;

    // Post-upload work, all non-blocking via waitUntil. Two cases:
    //
    // (a) HEIC: convert HEIC→JPEG inline (browsers can't render HEIC, so
    //     the asset is unbriefable until conversion lands).
    //
    // (b) Unbriefed video: generate poster so library cards have a
    //     thumbnail before the subscriber gets around to briefing.
    //
    // Briefed-on-upload no longer auto-fires the cascade (LOCKED 2026-05-16,
    // manual-first). Subscribers who upload via the briefed-on-upload mobile
    // flow still get the briefing metadata + processing_stage flip; the
    // cascade (asset_analysis, slug, variants) runs only when they
    // explicitly hit the Auto-tag preview/Apply in the modal.
    if (isHeic) {
      waitUntil(
        (async () => {
          try {
            const { convertHeicAsset } = await import("@/lib/pipeline/heic-convert");
            await convertHeicAsset(asset.id as string);
          } catch (err) {
            console.warn(
              "HEIC convert failed (non-fatal):",
              err instanceof Error ? err.message : err,
            );
          }
        })(),
      );
    } else if (isVideo) {
      waitUntil(
        (async () => {
          try {
            const { generatePosterForAsset } = await import("@/lib/pipeline/poster-gen");
            await generatePosterForAsset(asset.id as string);
          } catch (err) {
            console.warn(
              "Poster generation failed (non-fatal — asset has no poster):",
              err instanceof Error ? err.message : err,
            );
          }
        })(),
      );
    }

    // Face detection — fires for non-AI image uploads only. Writes to
    // media_assets.metadata.face_detection so the privacy pipeline can
    // blur/box/suppress at variant render time per the site's face_policy.
    // Detection is a pixel fact, runs once per upload, never re-run on
    // re-analysis. Per piece 2 of the privacy buildout.
    //
    // - HEIC: skip (no source bytes browsers/Rekognition can read until
    //   conversion). The HEIC waitUntil block above converts to JPEG; a
    //   future improvement could chain face detection after conversion.
    //   For v1, HEIC uploads get face detection only if subscriber later
    //   triggers a re-analysis after the converted URL exists.
    // - Video: skip (poster-frame detection misleads — faces move).
    //   Video face handling lives with the variant render piece (#4).
    // - AI-generated: skip per shouldDetectFaces() — no real-person
    //   likeness to protect.
    const isImage = media_type.toLowerCase().startsWith("image");
    if (isImage && !isHeic) {
      const skipBecauseAi = aiGeneratedFinal === true;
      if (!skipBecauseAi) {
        waitUntil(
          (async () => {
            try {
              const { detectFaces } = await import("@/lib/face-detect");
              const result = await detectFaces(finalUrl);
              await sql`
                UPDATE media_assets
                SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || ${JSON.stringify({ face_detection: result })}::jsonb,
                  updated_at = NOW()
                WHERE id = ${asset.id}
              `;
            } catch (err) {
              console.warn(
                "Face detection failed (non-fatal — privacy pipeline falls back to conservative):",
                err instanceof Error ? err.message : err,
              );
            }
          })(),
        );
      }
    }

    // Log usage
    await sql`
      INSERT INTO usage_log (billing_account_id, business_id, action, metadata)
      VALUES (${auth.subscriptionId}, ${site_id}, 'asset_upload', ${JSON.stringify({
        asset_id: asset.id,
        media_type,
        briefed_on_upload: briefedOnUpload,
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
    SELECT id FROM businesses WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Per project_tracpost_deletion_policy.md: filter archived assets out
  // of subscriber-visible listings unless explicitly requested via the
  // ?archived=true query param (operator/restore use case).
  const showArchived = url.searchParams.get("archived") === "true";

  const assets = status
    ? await sql`
        SELECT id, storage_url, media_type, context_note, processing_stage, quality_score, created_at, archived_at, briefable_at
        FROM media_assets
        WHERE business_id = ${siteId} AND processing_stage = ${status}
          AND (${showArchived} OR archived_at IS NULL)
        ORDER BY created_at DESC LIMIT 100
      `
    : await sql`
        SELECT id, storage_url, media_type, context_note, processing_stage, quality_score, created_at, archived_at, briefable_at
        FROM media_assets
        WHERE business_id = ${siteId}
          AND (${showArchived} OR archived_at IS NULL)
        ORDER BY created_at DESC LIMIT 100
      `;

  return NextResponse.json({ assets });
}
