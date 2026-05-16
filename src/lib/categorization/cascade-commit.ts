/**
 * Cascade commit orchestrator — the post-briefing event.
 *
 * Per the consumption-gated architecture (project_tracpost_asset_analysis
 * _cascade memory):
 *
 *   "Consumption is the gate. Nothing can consume an unbriefed asset.
 *    All consumable work fires at cascade commit, not save."
 *
 * This is the ONE place where everything consumable gets produced:
 *   1. Persist asset_analysis JSONB + asset_categories rows + asset_brands rows
 *   2. Derive slug from cascade output
 *   3. Rename source R2 key to slug-derived (if differs)
 *   4. Rename video poster (if asset has one)
 *   5. Cascade-delete existing variants + their R2 objects
 *   6. Render all variants with slug-derived keys
 *   7. Purge CDN cache for old URLs
 *
 * Fires from POST /api/assets/[id]/categorize/commit when subscriber/
 * operator confirms a cascade preview. Idempotent: re-firing with the
 * same slug is a no-op for R2 ops; re-firing with a different slug
 * re-renames everything.
 *
 * Cost beyond the LLM calls (which already happened in preview):
 *   - R2 copy + delete (~$0.0001 per rename)
 *   - Variant render: sharp/ffmpeg CPU time, ~5-10s total
 *   - CDN purge: free (Cloudflare API)
 */
import "server-only";
import { sql } from "@/lib/db";
import { renameR2Object, keyFromStorageUrl, R2_PUBLIC_DOMAIN, deleteObjectFromR2 } from "@/lib/r2";
import { deriveSourceKey } from "@/lib/pipeline/asset-keys";
import { renderAllVariantsForAsset } from "@/lib/pipeline/variant-render";
import { purgeCdnCache } from "@/lib/cdn";
import { persistStage2 } from "./stage2-multimodal";
import { matchBrandsFromNer } from "./brand-match";
import type { Stage1Result } from "./stage1-extract";
import type { Stage2Result } from "./stage2-multimodal";

export interface CommitCascadeInput {
  assetId: string;
  stage1: Stage1Result | null;
  stage2: Stage2Result;
}

export interface CommitCascadeResult {
  ok: boolean;
  categoryRows: number;
  /** Catalog brands linked from Stage 1 NER hits. */
  brandRows: number;
  /** NER brand candidates that didn't match the catalog — caller can
   * surface for promote-to-catalog. */
  suggestedNewBrandCount: number;
  slugApplied: string;
  renamed: boolean;
  variantCount: number;
  /** Warnings that didn't kill the commit (R2 rename failure, poster rename failure, etc.) */
  warnings: string[];
}

export async function commitCascade(input: CommitCascadeInput): Promise<CommitCascadeResult> {
  const { assetId, stage1, stage2 } = input;
  const warnings: string[] = [];

  // ── 1. Load asset state ──────────────────────────────────────────
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) throw new Error(`Asset ${assetId} not found`);

  const siteId = asset.site_id as string;
  const oldSourceUrl = asset.storage_url as string;
  const mediaType = (asset.media_type as string) || "";

  // ── 2. Persist cascade artifact + structured tags ────────────────
  const { categoryRows } = await persistStage2(assetId, stage1, stage2);

  // ── 2b. Brand matching from Stage 1 NER ──────────────────────────
  // Vision-based brand detection was retired (hallucinated from catalog
  // payload). NER → fuzzy catalog match is the proven path. Subscriber
  // can promote suggested_new entries to catalog from the asset modal;
  // that triggers enrichBrand() via the standard POST /api/brands path.
  const nerBrandCandidates = stage1?.entities.brands.map((b) => ({
    name: b.text,
    context: b.context_excerpt,
  })) ?? [];
  const brandMatch = await matchBrandsFromNer(siteId, nerBrandCandidates);
  let brandRows = 0;
  for (const m of brandMatch.matched) {
    await sql`
      INSERT INTO asset_brands (asset_id, brand_id)
      VALUES (${assetId}, ${m.brand_id})
      ON CONFLICT DO NOTHING
    `;
    brandRows++;
  }

  // ── 3. Derive slug + new R2 key from cascade output ──────────────
  // Fallback to UUID-prefix slug if cascade somehow didn't produce one
  // (defensive — should never happen since stage2 always populates url_slug)
  const slug = stage2.url_slug?.trim() || `asset-${assetId.replace(/-/g, "").slice(0, 8)}`;
  const oldKey = keyFromStorageUrl(oldSourceUrl);
  const ext = oldSourceUrl.split(".").pop()?.split("?")[0] || "bin";
  const newKey = deriveSourceKey(siteId, slug, assetId, ext);

  // ── 4. Rename source R2 key if slug differs from current key ─────
  let renamed = false;
  let currentSourceUrl = oldSourceUrl;
  if (oldKey && oldKey !== newKey) {
    try {
      const newUrl = await renameR2Object(oldKey, newKey);
      await sql`
        UPDATE media_assets
        SET storage_url = ${newUrl}, updated_at = NOW()
        WHERE id = ${assetId}
      `;
      try {
        await purgeCdnCache([oldSourceUrl]);
      } catch {
        // Non-fatal — Cloudflare will TTL out the old URL
      }
      renamed = true;
      currentSourceUrl = newUrl;
    } catch (err) {
      const msg = `R2 source rename failed: ${err instanceof Error ? err.message : err}`;
      warnings.push(msg);
      console.error(`commitCascade ${assetId}: ${msg}`);
      // Continue — we'll still render variants with the old source URL
    }
  }

  // ── 5. Rename video poster (if asset has one) ────────────────────
  if (asset.poster_asset_id) {
    try {
      const [poster] = await sql`
        SELECT id, storage_url FROM media_assets WHERE id = ${asset.poster_asset_id}
      `;
      if (poster?.storage_url) {
        const posterUrl = poster.storage_url as string;
        const posterOldKey = keyFromStorageUrl(posterUrl);
        const posterNewKey = `sites/${siteId}/posters/${slug}-${assetId.replace(/-/g, "").slice(0, 8)}-poster.jpg`;
        if (posterOldKey && posterOldKey !== posterNewKey) {
          const posterNewUrl = await renameR2Object(posterOldKey, posterNewKey);
          await sql`
            UPDATE media_assets
            SET storage_url = ${posterNewUrl}, updated_at = NOW()
            WHERE id = ${poster.id}
          `;
          try {
            await purgeCdnCache([posterUrl]);
          } catch {
            // Non-fatal
          }
        }
      }
    } catch (err) {
      const msg = `Poster rename failed: ${err instanceof Error ? err.message : err}`;
      warnings.push(msg);
      console.warn(`commitCascade ${assetId}: ${msg}`);
    }
  }

  // ── 6. Cascade-delete existing variants + their R2 objects ───────
  const existingVariants = await sql`
    SELECT id, storage_url FROM asset_variants WHERE source_asset_id = ${assetId}
  `;
  for (const v of existingVariants) {
    const vUrl = v.storage_url as string;
    if (vUrl && vUrl.startsWith(R2_PUBLIC_DOMAIN)) {
      const vKey = keyFromStorageUrl(vUrl);
      if (vKey) {
        try {
          await deleteObjectFromR2(vKey);
        } catch {
          // Non-fatal — at worst R2 has a dangling file
        }
      }
    }
  }
  if (existingVariants.length > 0) {
    await sql`DELETE FROM asset_variants WHERE source_asset_id = ${assetId}`;
  }

  // ── 7. Render all variants with slug-derived keys ────────────────
  // renderAllVariantsForAsset picks up the (now-renamed) source URL and
  // derives variant keys from it via extractSlugFromSourceUrl.
  let variantCount = 0;
  try {
    const variantResults = await renderAllVariantsForAsset(assetId);
    variantCount = variantResults.length;
  } catch (err) {
    const msg = `Variant render failed: ${err instanceof Error ? err.message : err}`;
    warnings.push(msg);
    console.error(`commitCascade ${assetId}: ${msg}`);
  }

  // ── 8. Touch updated_at + log commit summary ─────────────────────
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      cascade_committed_at: new Date().toISOString(),
      cascade_slug: slug,
    })}::jsonb,
    updated_at = NOW()
    WHERE id = ${assetId}
  `;

  console.log(
    `commitCascade ${assetId}: slug="${slug}" renamed=${renamed} ` +
      `categoryRows=${categoryRows} brandRows=${brandRows} ` +
      `suggestedNewBrands=${brandMatch.suggested_new.length} ` +
      `variants=${variantCount} warnings=${warnings.length}`,
  );

  // Suppress unused-var warning on currentSourceUrl in case we don't
  // use it further (kept for potential future use)
  void currentSourceUrl;

  return {
    ok: true,
    categoryRows,
    brandRows,
    suggestedNewBrandCount: brandMatch.suggested_new.length,
    slugApplied: slug,
    renamed,
    variantCount,
    warnings,
  };
}
