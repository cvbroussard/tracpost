import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { renderTemplateVariant } from "@/lib/pipeline/variant-render";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/assets/[id]/render-variants
 *
 * Renders an asset's platform variants. SELF-CHAINING — one video
 * template per Vercel invocation.
 *
 * Each video template now runs a Director Call + a Kling Producer Call
 * that can poll for minutes. Three serial Kling renders in one
 * invocation would blow the 300s budget, so the route renders one video
 * template per invocation and fire-and-forgets the next.
 *
 * Initial call (no templateId — fired by cascade-commit):
 *   - audio → render feed_square only; done.
 *   - still → render the 3 sharp image templates (parallel, fast), then
 *             fire the video chain at reel_9x16.
 *   - video → fire the video chain at reel_9x16 (image templates from
 *             video frame extraction aren't implemented).
 *
 * Chained call ({templateId}): render that one video template, then fire
 * the next in sequence. The sequence is fixed and serial so the Director
 * Call's variety knob can read the prior template's thread_used — which
 * is persisted on its variant row before the next invocation fires.
 *
 * Idempotent: re-firing replaces variants. `variants_pending` flips
 * false only when the final template (long_16x9) lands.
 */

const VIDEO_SEQUENCE = ["reel_9x16", "story_9x16", "long_16x9"] as const;
const IMAGE_TEMPLATES = ["feed_square", "feed_portrait", "pin_2x3"];

function nextVideoTemplate(current: string): string | null {
  const i = (VIDEO_SEQUENCE as readonly string[]).indexOf(current);
  return i >= 0 && i < VIDEO_SEQUENCE.length - 1 ? VIDEO_SEQUENCE[i + 1] : null;
}

/**
 * Fire the next invocation in the chain — fire-and-forget via waitUntil.
 * Returns false when @vercel/functions is unavailable (local dev), so
 * the caller can fall back to inline rendering.
 */
async function fireNext(
  req: NextRequest,
  assetId: string,
  templateId: string,
): Promise<boolean> {
  try {
    const { waitUntil } = await import("@vercel/functions");
    const host = req.headers.get("host");
    const protocol =
      host?.includes("localhost") || host?.includes("127.0.0.1") ? "http" : "https";
    const cookie = req.headers.get("cookie") || "";
    waitUntil(
      fetch(`${protocol}://${host}/api/assets/${assetId}/render-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ templateId }),
      }).catch((e) =>
        console.error(`render-variants chain dispatch failed (${templateId}):`, e),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

async function markComplete(assetId: string): Promise<void> {
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      variants_pending: false,
      variants_rendered_at: new Date().toISOString(),
    })}::jsonb,
    updated_at = NOW()
    WHERE id = ${assetId}
  `;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const [asset] = await sql`
    SELECT id, site_id, media_type FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const templateId: string | undefined =
    typeof body?.templateId === "string" ? body.templateId : undefined;

  try {
    // ── Chained call: render one video template, fire the next ────────
    if (templateId) {
      await renderTemplateVariant(assetId, templateId);
      const next = nextVideoTemplate(templateId);
      if (next) {
        await fireNext(req, assetId, next);
        return NextResponse.json({ ok: true, rendered: templateId, next });
      }
      await markComplete(assetId);
      return NextResponse.json({ ok: true, rendered: templateId, chainComplete: true });
    }

    // ── Initial call ──────────────────────────────────────────────────
    const mediaType = ((asset.media_type as string) || "").toLowerCase();

    // Audio: a single audiogram-style variant, no video chain.
    if (mediaType.startsWith("audio")) {
      await renderTemplateVariant(assetId, "feed_square");
      await markComplete(assetId);
      return NextResponse.json({ ok: true, phase: "audio-complete" });
    }

    // Still sources get the 3 sharp image templates up front — parallel,
    // fast, no timeout risk. Video sources skip them.
    if (!mediaType.startsWith("video")) {
      await Promise.all(IMAGE_TEMPLATES.map((t) => renderTemplateVariant(assetId, t)));
    }

    // Kick off the sequential video chain.
    const dispatched = await fireNext(req, assetId, VIDEO_SEQUENCE[0]);
    if (!dispatched) {
      // @vercel/functions unavailable (local dev) — render the video
      // chain inline. May exceed the 300s budget, but local dev has no
      // function-timeout enforcement.
      for (const t of VIDEO_SEQUENCE) await renderTemplateVariant(assetId, t);
      await markComplete(assetId);
      return NextResponse.json({ ok: true, phase: "inline-fallback-complete" });
    }
    return NextResponse.json({ ok: true, phase: "image-batch-done,video-chain-started" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `render-variants failed for ${assetId} (templateId=${templateId ?? "initial"}):`,
      message,
    );
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
