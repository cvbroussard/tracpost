/**
 * Render pipeline step — called after triage, before caption.
 *
 * For each triaged asset, queries the platform playbook for render
 * plans (one per connected platform), then calls the render engine
 * to produce and store variants. Skips assets that are already
 * rendered or failed, and video assets (Phase 5).
 */
import "server-only";
import { sql } from "@/lib/db";
import { renderAsset } from "@/lib/render/engine";
import {
  generateRenderPlans,
  loadTenantSignals,
  loadContentSignals,
} from "@/lib/render/playbook";

/**
 * Render variants for a single asset. Called from the pipeline
 * cron or from a manual trigger in the admin UI.
 */
export async function renderAssetVariants(assetId: string): Promise<{
  rendered: number;
  skipped: boolean;
  reason?: string;
}> {
  const [asset] = await sql`
    SELECT business_id, render_status, media_type
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return { rendered: 0, skipped: true, reason: "not found" };

  // Skip already-rendered assets
  if (asset.render_status === "rendered") {
    return { rendered: 0, skipped: true, reason: "already rendered" };
  }

  // Skip permanently failed assets (3+ attempts)
  if (asset.render_status === "skipped") {
    return { rendered: 0, skipped: true, reason: "permanently skipped after repeated failures" };
  }

  // Skip video assets for now (Phase 5)
  if ((asset.media_type as string)?.startsWith("video")) {
    await sql`UPDATE media_assets SET render_status = 'skipped' WHERE id = ${assetId}`;
    return { rendered: 0, skipped: true, reason: "video (Phase 5)" };
  }

  const siteId = asset.business_id as string;

  try {
    const [tenantSignals, contentSignals] = await Promise.all([
      loadTenantSignals(siteId),
      loadContentSignals(assetId),
    ]);

    const plans = await generateRenderPlans(contentSignals, tenantSignals);

    if (plans.length === 0) {
      await sql`UPDATE media_assets SET render_status = 'skipped' WHERE id = ${assetId}`;
      return { rendered: 0, skipped: true, reason: "no connected platforms" };
    }

    const variants = await renderAsset(assetId, plans);
    return { rendered: Object.keys(variants).length, skipped: false };
  } catch (err) {
    console.error(`Render failed for asset ${assetId}:`, err);
    // Track retry count — skip permanently after 3 failures
    const [meta] = await sql`
      SELECT COALESCE((metadata->>'render_retries')::int, 0) AS retries
      FROM media_assets WHERE id = ${assetId}
    `;
    const retries = ((meta?.retries as number) || 0) + 1;
    const newStatus = retries >= 3 ? "skipped" : "failed";
    await sql`
      UPDATE media_assets
      SET render_status = ${newStatus},
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            render_retries: retries,
            render_last_error: err instanceof Error ? err.message : "unknown",
          })}::jsonb
      WHERE id = ${assetId}
    `;
    return { rendered: 0, skipped: true, reason: err instanceof Error ? err.message : "unknown error" };
  }
}

/**
 * Batch render for all pending assets on a site.
 */
export async function renderPendingAssets(siteId: string): Promise<{
  total: number;
  rendered: number;
  skipped: number;
}> {
  const pending = await sql`
    SELECT id FROM media_assets
    WHERE business_id = ${siteId}
      AND render_status = 'pending'
      AND processing_stage = 'analyzed'
      AND media_type LIKE 'image%'
    ORDER BY quality_score DESC NULLS LAST
    LIMIT 20
  `;

  let rendered = 0;
  let skipped = 0;

  for (const row of pending) {
    const result = await renderAssetVariants(row.id as string);
    if (result.skipped) skipped++;
    else rendered += result.rendered;
  }

  return { total: pending.length, rendered, skipped };
}
