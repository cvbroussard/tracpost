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
 *   1. Persist ai_analysis JSONB + asset_categories rows
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
import { NER_SYSTEM_PROMPT } from "./ner-extract";
import { buildVisionSystemPrompt } from "./vision-analyze";

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
    SET ai_analysis = ${JSON.stringify(analysis)}::jsonb,
        processing_stage = 'analyzed',
        updated_at = NOW()
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

  // ── 2a. Append analysis_events history rows ──────────────────────
  // Per [[persist-prompts-with-outputs]] — every LLM-driven feature
  // persists verbatim prompt + input snapshot + output. The Director
  // does this via production_events; cascade was the gap until now.
  // Two rows per commit: one for the NER (Haiku) call, one for the
  // Vision (Sonnet) call. ai_analysis stays as the denormalized
  // "latest" cache; this table is the queryable history.
  //
  // Input snapshot is fetched at commit time (not preview time). Risk:
  // small drift if site config or transcript changed between preview
  // and commit. Acceptable for v1; tightenable to true preview-time
  // capture if drift becomes visible.
  //
  // Non-fatal — history-write failure should NOT roll back the cascade
  // commit (the user's analysis must persist regardless).
  try {
    const [transcriptRow] = await sql`
      SELECT transcript FROM recordings
      WHERE source_asset_id = ${assetId}
        AND transcript IS NOT NULL AND transcript <> ''
        AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const transcript = (transcriptRow?.transcript as string) || "";

    const [siteRow] = await sql`
      SELECT pillar_config, brand_dna FROM sites WHERE id = ${siteId}
    `;
    const siteCategories = await sql`
      SELECT sgc.gcid, gc.name
      FROM site_gbp_categories sgc
      JOIN gbp_categories gc ON gc.gcid = sgc.gcid
      WHERE sgc.site_id = ${siteId}
    `;

    const nerInputSnapshot = { transcript };
    const visionInputSnapshot = {
      transcript,
      ner_entities: analysis.entities,
      ner_suggested_tags: analysis.suggested_tags,
      site_categories: siteCategories,
      pillar_config: siteRow?.pillar_config ?? [],
      brand_dna_digest_present: Boolean(siteRow?.brand_dna),
    };

    const nerOutput = {
      entities: analysis.entities,
      suggested_tags: analysis.suggested_tags,
    };
    const visionOutput = {
      asset_categories: analysis.asset_categories,
      scene_types: analysis.scene_types,
      url_slug: analysis.url_slug,
      story_angles: analysis.story_angles,
      suggested_pillar: analysis.suggested_pillar,
      caption_hints: analysis.caption_hints,
      motion_sequence: analysis.motion_sequence,
    };

    await sql.transaction([
      sql`
        INSERT INTO analysis_events
          (asset_id, site_id, process, model, prompt, input_snapshot, output, cost)
        VALUES (
          ${assetId}, ${siteId}, 'ner_call', ${analysis.model_versions.ner},
          ${NER_SYSTEM_PROMPT},
          ${JSON.stringify(nerInputSnapshot)}::jsonb,
          ${JSON.stringify(nerOutput)}::jsonb,
          ${JSON.stringify({
            input_tokens: analysis.cost.ner_input_tokens,
            output_tokens: analysis.cost.ner_output_tokens,
          })}::jsonb
        )
      `,
      sql`
        INSERT INTO analysis_events
          (asset_id, site_id, process, model, prompt, input_snapshot, output, cost)
        VALUES (
          ${assetId}, ${siteId}, 'vision_call', ${analysis.model_versions.vision},
          ${buildVisionSystemPrompt()},
          ${JSON.stringify(visionInputSnapshot)}::jsonb,
          ${JSON.stringify(visionOutput)}::jsonb,
          ${JSON.stringify({
            input_tokens: analysis.cost.vision_input_tokens,
            output_tokens: analysis.cost.vision_output_tokens,
          })}::jsonb
        )
      `,
    ]);
  } catch (err) {
    warnings.push(`analysis_events write failed: ${err instanceof Error ? err.message : err}`);
    console.warn(
      `commitCascade ${assetId}: analysis_events write failed:`,
      err instanceof Error ? err.message : err,
    );
  }

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
  // Full destructive replace (policy locked 2026-05-19): a new brief is
  // the only thing that fires re-analysis, and committing a new brief
  // is the subscriber implicitly declaring "I have new context; re-
  // derive everything." Every asset_brands row gets wiped regardless of
  // provenance — manual edits don't survive the next brief. Subscribers
  // who want their overrides preserved should make them AFTER the most
  // recent analysis and refrain from recording another brief. The
  // assigned_by column from migration 127 stays as audit-only metadata.
  await sql`
    DELETE FROM asset_brands WHERE asset_id = ${assetId}
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
    // Write-once-by-analyzer policy (locked 2026-05-19): the analyzer
    // gets exactly one shot to create a brand row. Once it exists,
    // subscriber edits to name/URL/description are sovereign — the
    // analyzer NEVER overwrites them. So ON CONFLICT DO NOTHING (not
    // DO UPDATE). When a conflict happens, the existing row's id is
    // fetched via the follow-up SELECT and used for the binding.
    // enrichBrand fires async for newly-created rows only.
    const newBrandIds: Array<{ id: string; name: string }> = [];
    for (const b of approvals.brands_to_create) {
      const name = b.name.trim();
      if (name.length === 0) continue;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40);
      const insertResult = await sql`
        INSERT INTO brands (
          site_id, name, slug, seed_source, seed_asset_id, authorized_at, enrichment_status
        )
        VALUES (
          ${siteId}, ${name}, ${slug},
          'audio_transcript', ${assetId}, NOW(), 'pending'
        )
        ON CONFLICT (site_id, slug) DO NOTHING
        RETURNING id
      `;
      let brandId: string;
      const wasCreated = insertResult.length > 0;
      if (wasCreated) {
        brandId = insertResult[0].id as string;
      } else {
        const [existing] = await sql`
          SELECT id FROM brands WHERE site_id = ${siteId} AND slug = ${slug}
        `;
        if (!existing) continue; // shouldn't happen but be defensive
        brandId = existing.id as string;
      }
      await sql`
        INSERT INTO asset_brands (asset_id, brand_id, assigned_by)
        VALUES (${assetId}, ${brandId}, 'subscriber')
        ON CONFLICT DO NOTHING
      `;
      approvedBrandRows++;
      // Only enrich rows we actually created — never re-enrich an
      // existing row (subscriber edits to URL/description are sovereign).
      if (wasCreated) {
        newBrandIds.push({ id: brandId, name });
      }
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
