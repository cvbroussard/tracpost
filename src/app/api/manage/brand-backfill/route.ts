import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { enrichBrand, captureLogoAsHeroAsset } from "@/lib/brand-enrich";

/**
 * POST /api/manage/brand-backfill
 * Body (all optional): { limit?, dry_run? }
 *
 * Force-enriches every brand row, regardless of current state.
 * enrichBrand is called with `force: true`, which bypasses the
 * idempotency gates (enriched_at, skipped status, existing url) and
 * uses COALESCE on the way out — so existing user-set values are
 * preserved, only gaps get filled.
 *
 * Sequential to keep Sonnet + outbound HTTP polite. Safe to re-run.
 *
 * One-time operator tool for sweeping pre-#214 brand rows. Forward
 * brand creation enriches inline via /api/brands POST; everything
 * else is manual.
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(1000, body.limit)) : 500;
  const dryRun = body.dry_run === true;

  // Re-logo mode: walks all brands and replaces hero_asset_id with a
  // Brandfetch-captured logo whenever Brandfetch has the brand. Existing
  // hero is preserved if Brandfetch returns nothing (no downgrade).
  // Brands already sourced from Brandfetch are skipped (idempotent).
  const relogoBrandfetch = body.relogo_via_brandfetch === true;
  const brandfetchClientId = process.env.BRANDFETCH_CLIENT_ID;
  if (relogoBrandfetch && !brandfetchClientId) {
    return NextResponse.json(
      { error: "BRANDFETCH_CLIENT_ID env var not set — cannot re-logo via Brandfetch" },
      { status: 400 },
    );
  }

  const rows = await sql`
    SELECT id, name FROM brands
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      candidate_count: rows.length,
      candidates: rows.map((r) => ({ id: r.id, name: r.name })),
    });
  }

  type Result = {
    name: string;
    status: string;
    url: string | null;
    description: string | null;
    hero_url: string | null;
    og_image_url: string | null;
    hero_source: string | null;
    id: string;
    error?: string;
  };
  const results: Result[] = [];
  let enriched = 0;
  let noMatch = 0;
  let failed = 0;

  for (const row of rows) {
    const id = row.id as string;
    const name = row.name as string;
    try {
      if (relogoBrandfetch) {
        // Brandfetch-only re-logo. Preserves Claude/OG description,
        // touches only hero_asset_id and metadata.hero_source.
        const [brandRow] = await sql`
          SELECT business_id, url,
                 enrichment_metadata->>'hero_source' AS current_hero_source
          FROM brands WHERE id = ${id}
        `;
        const brandUrl = (brandRow?.url as string | null) || null;
        const currentSource = (brandRow?.current_hero_source as string | null) || "";
        if (!brandUrl) {
          results.push({ name, status: "skipped (no url)", url: null, description: null, hero_url: null, og_image_url: null, hero_source: null, id });
        } else {
          let bfUrl: string | null = null;
          try {
            const apex = new URL(brandUrl).hostname.replace(/^www\./, "");
            // fallback=404 prevents Brandfetch from serving their
            // placeholder lettermark when they don't have the brand
            bfUrl = `https://cdn.brandfetch.io/${encodeURIComponent(apex)}?c=${encodeURIComponent(brandfetchClientId!)}&fallback=404`;
          } catch { /* invalid url */ }
          let newAssetId: string | null = null;
          if (bfUrl) {
            newAssetId = await captureLogoAsHeroAsset(brandRow.business_id as string, id, name, brandUrl, bfUrl);
          }
          if (newAssetId) {
            await sql`
              UPDATE brands
              SET hero_asset_id = ${newAssetId},
                  logo_service_url = ${bfUrl},
                  enrichment_metadata = jsonb_set(
                    COALESCE(enrichment_metadata, '{}'::jsonb),
                    '{hero_source}',
                    to_jsonb(${bfUrl}::text)
                  )
              WHERE id = ${id}
            `;
            enriched++;
            const [after] = await sql`
              SELECT ma.storage_url AS hero_url
              FROM brands b
              LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
              WHERE b.id = ${id}
            `;
            results.push({ name, status: "relogoed", url: brandUrl, description: null, hero_url: (after?.hero_url as string | null) || null, og_image_url: null, hero_source: bfUrl, id });
          } else if (currentSource.includes("brandfetch.io")) {
            // Brandfetch returned 404 (with our fallback=404 param) but the
            // existing hero CAME from Brandfetch — meaning what we have is
            // the placeholder lettermark from before fallback=404 was set.
            // Clear it so the subscriber sees the letter avatar and knows
            // to manually paste a real logo.
            await sql`
              UPDATE brands
              SET hero_asset_id = NULL,
                  logo_service_url = NULL
              WHERE id = ${id}
            `;
            noMatch++;
            results.push({ name, status: "cleared placeholder", url: brandUrl, description: null, hero_url: null, og_image_url: null, hero_source: null, id });
          } else {
            // Brandfetch had no entry, but existing hero came from somewhere
            // else (R2 manual paste, prior favicon capture). Leave alone.
            noMatch++;
            results.push({ name, status: "no brandfetch entry", url: brandUrl, description: null, hero_url: null, og_image_url: null, hero_source: null, id });
          }
        }
      } else {
        // Standard enrichment path (force-mode)
        await enrichBrand(id, name, { force: true });
        const [after] = await sql`
          SELECT b.enrichment_status, b.url, b.description,
                 b.enrichment_metadata->>'og_image_url' AS og_image_url,
                 b.enrichment_metadata->>'hero_source' AS hero_source,
                 ma.storage_url AS hero_url
          FROM brands b
          LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
          WHERE b.id = ${id}
        `;
        const status = (after?.enrichment_status as string) || "unknown";
        results.push({
          name,
          status,
          url: (after?.url as string | null) || null,
          description: (after?.description as string | null) || null,
          hero_url: (after?.hero_url as string | null) || null,
          og_image_url: (after?.og_image_url as string | null) || null,
          hero_source: (after?.hero_source as string | null) || null,
          id,
        });
        if (status === "enriched") enriched++;
        else if (status === "no_match") noMatch++;
        else if (status === "failed") failed++;
      }
    } catch (err) {
      failed++;
      results.push({
        name,
        status: "failed",
        url: null,
        description: null,
        hero_url: null,
        og_image_url: null,
        hero_source: null,
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed: rows.length,
    enriched,
    no_match: noMatch,
    failed,
    results,
  });
}
