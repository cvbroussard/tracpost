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
 *   1. Persist asset_analysis JSONB + asset_categories rows
 *   2. Brand match (NER → catalog) + asset_brands rows
 *   3. Derive slug from cascade output
 *   4. Rename source R2 key to slug-derived (if differs)
 *   5. Rename video poster (if asset has one)
 *   6. Cascade-delete existing variants + their R2 objects
 *   7. Render all variants with slug-derived keys
 *   8. Purge CDN cache for old URLs
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
import { purgeCdnCache } from "@/lib/cdn";
import { matchBrandsFromNer } from "./brand-match";
import type { CascadeAnalysis } from "./cascade-analyze";

export interface CommitCascadeInput {
  assetId: string;
  analysis: CascadeAnalysis;
  /** Subscriber-approved promotions from the approval card. Optional;
   * absent = silent auto-binding only. Only brands have a cascade
   * promotion path — projects are bound deliberately at upload time
   * (per 2026-05-18 cascade-vs-deliberate split). */
  approvals?: {
    /** New brands to create + link to this asset. Name comes from NER
     * suggested_new; subscriber approved the promote. URL etc. are
     * left blank — enrichBrand fires async to fill them. */
    brands_to_create?: Array<{ name: string; context?: string }>;
  };
}

export interface CommitCascadeResult {
  ok: boolean;
  categoryRows: number;
  /** Catalog brands linked from NER hits. */
  brandRows: number;
  /** NER brand candidates that didn't match the catalog — caller can
   * surface for promote-to-catalog. */
  suggestedNewBrandCount: number;
  /** Brands the subscriber promoted via the approval card. */
  approvedBrandRows: number;
  slugApplied: string;
  renamed: boolean;
  variantCount: number;
  /** Warnings that didn't kill the commit (R2 rename failure, poster rename failure, etc.) */
  warnings: string[];
}

/**
 * Persist the cascade artifact to JSONB + asset_categories rows.
 * Preserves operator/subscriber overrides on asset_categories.
 */
async function persistCascadeArtifact(
  assetId: string,
  analysis: CascadeAnalysis,
): Promise<{ categoryRows: number }> {
  await sql`
    UPDATE media_assets
    SET asset_analysis = ${JSON.stringify(analysis)}::jsonb, updated_at = NOW()
    WHERE id = ${assetId}
  `;

  const overrides = await sql`
    SELECT gcid, is_primary FROM asset_categories
    WHERE asset_id = ${assetId} AND assigned_by != 'auto'
  `;
  const overrideGcids = new Set(overrides.map((r) => r.gcid as string));
  const hasOverridePrimary = overrides.some((r) => r.is_primary === true);

  await sql`DELETE FROM asset_categories WHERE asset_id = ${assetId} AND assigned_by = 'auto'`;

  let categoryRows = 0;
  const primary = analysis.asset_categories.primary;
  if (!overrideGcids.has(primary.gcid)) {
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${primary.gcid}, ${!hasOverridePrimary},
              ${primary.confidence}, 'auto', ${primary.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
    categoryRows++;
  }
  for (const s of analysis.asset_categories.secondaries) {
    if (overrideGcids.has(s.gcid)) continue;
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, confidence, assigned_by, reasoning)
      VALUES (${assetId}, ${s.gcid}, false, ${s.confidence}, 'auto', ${s.reasoning})
      ON CONFLICT (asset_id, gcid) DO NOTHING
    `;
    categoryRows++;
  }

  return { categoryRows };
}

export async function commitCascade(input: CommitCascadeInput): Promise<CommitCascadeResult> {
  const { assetId, analysis, approvals } = input;
  const warnings: string[] = [];

  // ── 1. Load asset state ──────────────────────────────────────────
  const [asset] = await sql`
    SELECT id, site_id, storage_url, media_type, poster_asset_id, gps_lat, gps_lng
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) throw new Error(`Asset ${assetId} not found`);

  const siteId = asset.site_id as string;
  const oldSourceUrl = asset.storage_url as string;

  // ── 2. Persist cascade artifact + structured tags ────────────────
  const { categoryRows } = await persistCascadeArtifact(assetId, analysis);

  // ── 2b. Brand matching from NER hits ─────────────────────────────
  // Vision-based brand detection was retired (hallucinated from catalog
  // payload). NER → fuzzy catalog match is the proven path. Subscriber
  // can promote suggested_new entries to catalog from the asset modal;
  // that triggers enrichBrand() via the standard POST /api/brands path.
  const nerBrandCandidates = analysis.entities.brands.map((b) => ({
    name: b.text,
    context: b.context_excerpt,
  }));
  const brandMatch = await matchBrandsFromNer(siteId, nerBrandCandidates);
  // Destructive replace of algorithmic rows (per autopilot mental model
  // 2026-05-18): the cascade's current view IS the asset's current
  // truth. Subscriber/operator manual assignments (assigned_by !=
  // 'auto') stay untouched. ON CONFLICT then handles the case where a
  // 'subscriber' row already exists for the same matched brand.
  await sql`
    DELETE FROM asset_brands
    WHERE asset_id = ${assetId} AND assigned_by = 'auto'
  `;
  let brandRows = 0;
  for (const m of brandMatch.matched) {
    await sql`
      INSERT INTO asset_brands (asset_id, brand_id, assigned_by)
      VALUES (${assetId}, ${m.brand_id}, 'auto')
      ON CONFLICT DO NOTHING
    `;
    brandRows++;
  }

  // Project matching retired from the cascade 2026-05-18. Projects are
  // deliberate subscriber buckets, set at upload time. The cascade
  // still extracts entities.projects in the NER raw output (useful for
  // narrative context, caption generation, transcript display) but
  // does NOT bind to the projects catalog. Asset-to-project membership
  // is the subscriber's call; auto-inference proved too messy (GPS
  // ambiguity at multi-project addresses, NER hallucinations getting
  // silently promoted on default-checked approval).
  //
  // The asset_projects.assigned_by column from migration 127 stays —
  // no current writer stamps 'auto' but the column still preserves
  // 'subscriber'/'operator' provenance for existing bindings and any
  // future writer that wants destructive-replace semantics.

  // ── 2d. Apply subscriber approvals from the approval card ────────
  // Only brand promotions remain in the cascade approval path. Run
  // AFTER auto-binds so ON CONFLICT collisions resolve naturally.
  let approvedBrandRows = 0;

  if (approvals?.brands_to_create && approvals.brands_to_create.length > 0) {
    // Mirror POST /api/brands: name → slug, ON CONFLICT DO UPDATE so
    // simultaneous approvals across assets converge. enrichBrand fires
    // async to fill URL/description/logo from the web; subscriber sees
    // the brand land immediately, enrichment polishes later.
    const newBrandIds: Array<{ id: string; name: string }> = [];
    for (const b of approvals.brands_to_create) {
      const name = b.name.trim();
      if (name.length === 0) continue;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40);
      const [brand] = await sql`
        INSERT INTO brands (
          site_id, name, slug, seed_source, seed_asset_id, authorized_at, enrichment_status
        )
        VALUES (
          ${siteId}, ${name}, ${slug},
          'audio_transcript', ${assetId}, NOW(), 'pending'
        )
        ON CONFLICT (site_id, slug) DO UPDATE SET name = ${name}
        RETURNING id
      `;
      await sql`
        INSERT INTO asset_brands (asset_id, brand_id, assigned_by)
        VALUES (${assetId}, ${brand.id}, 'subscriber')
        ON CONFLICT DO NOTHING
      `;
      approvedBrandRows++;
      newBrandIds.push({ id: brand.id as string, name });
    }
    // Fire enrichment async — same waitUntil pattern as POST /api/brands.
    if (newBrandIds.length > 0) {
      import("@vercel/functions").then(({ waitUntil }) => {
        waitUntil(
          (async () => {
            for (const { id, name } of newBrandIds) {
              try {
                const { enrichBrand } = await import("@/lib/brand-enrich");
                await enrichBrand(id, name);
              } catch (err) {
                console.warn(`enrichBrand failed for ${id}:`, err instanceof Error ? err.message : err);
              }
            }
          })(),
        );
      }).catch(() => { /* @vercel/functions unavailable */ });
    }
  }


  // ── 3. Derive slug + new R2 key from cascade output ──────────────
  const slug = analysis.url_slug?.trim() || `asset-${assetId.replace(/-/g, "").slice(0, 8)}`;
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

  // ── 7. Stamp metadata + flag variants pending ────────────────────
  // commitCascade is now purely about persisting the artifact + brand
  // links + source rename. Variant render is a separate concern fired
  // by the commit ENDPOINT after this function returns (decoupled so
  // each gets its own 60s Vercel function budget). Subscriber is
  // released as soon as this returns — typically ~1-2s.
  //
  // variants_pending=true is set here and cleared by the separate
  // /api/assets/[id]/render-variants endpoint once render completes.
  // If render fails or never fires, this flag stays true and the
  // orchestrator pool query naturally skips the asset.
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      cascade_committed_at: new Date().toISOString(),
      cascade_slug: slug,
      variants_pending: true,
    })}::jsonb,
    updated_at = NOW()
    WHERE id = ${assetId}
  `;

  console.log(
    `commitCascade ${assetId}: slug="${slug}" renamed=${renamed} ` +
      `categoryRows=${categoryRows} brandRows=${brandRows} ` +
      `suggestedNewBrands=${brandMatch.suggested_new.length} ` +
      `approvedBrands=${approvedBrandRows} ` +
      `warnings=${warnings.length} (variants → separate endpoint)`,
  );

  void currentSourceUrl;

  return {
    ok: true,
    categoryRows,
    brandRows,
    suggestedNewBrandCount: brandMatch.suggested_new.length,
    approvedBrandRows,
    slugApplied: slug,
    renamed,
    variantCount: 0, // Variants now render via separate endpoint; count not known at commit time.
    warnings,
  };
}
