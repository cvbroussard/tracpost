import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/brands?site_id=...
 * List brands for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ brands: [] });
  }

  const brands = await sql`
    SELECT b.id, b.name, b.slug, b.url, b.description, b.hero_asset_id,
           b.created_at, ma.storage_url AS hero_url
    FROM brands b
    LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
    WHERE b.site_id = ${siteId}
    ORDER BY b.name ASC
  `;

  return NextResponse.json({ brands });
}

/**
 * POST /api/brands — create a brand
 * Body: { name, url?, description?, hero_asset_id?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const {
    name, url, description, hero_asset_id, site_id,
    seed_source, seed_recording_id, seed_asset_id,
  } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  // Provenance: default to typed_subscriber when audio fields not provided.
  // Audio-first auto-tagging (#201) sets seed_source='audio_transcript' +
  // seed_recording_id + seed_asset_id when calling.
  const seedSource = seed_source || (seed_recording_id ? "audio_transcript" : "typed_subscriber");

  const [brand] = await sql`
    INSERT INTO brands (
      site_id, name, slug, url, description, hero_asset_id,
      seed_source, seed_recording_id, seed_asset_id, authorized_at, enrichment_status
    )
    VALUES (
      ${site_id}, ${name.trim()}, ${slug}, ${url || null}, ${description || null}, ${hero_asset_id || null},
      ${seedSource}, ${seed_recording_id || null}, ${seed_asset_id || null}, NOW(),
      ${url ? "skipped" : "pending"}
    )
    ON CONFLICT (site_id, slug) DO UPDATE SET
      name = ${name.trim()},
      url = COALESCE(brands.url, ${url || null}),
      description = COALESCE(brands.description, ${description || null}),
      hero_asset_id = COALESCE(brands.hero_asset_id, ${hero_asset_id || null})
    RETURNING id, name, slug, url, description, hero_asset_id, seed_source, enrichment_status
  `;

  // Async enrichment whenever no URL was provided. Gate is independent of
  // seed_source — keyword_cue, manual_modal, typed_subscriber all enrich
  // the same way. Idempotency lives inside enrichBrand() via enriched_at.
  if (!url) {
    import("@vercel/functions").then(({ waitUntil }) => {
      waitUntil(
        (async () => {
          try {
            const { enrichBrand } = await import("@/lib/brand-enrich");
            await enrichBrand(brand.id as string, name.trim());
          } catch (err) {
            console.warn(`Brand enrichment failed for ${brand.id}:`, err instanceof Error ? err.message : err);
          }
        })(),
      );
    }).catch(() => { /* @vercel/functions unavailable */ });
  }

  // Backlink the seed asset
  if (seed_asset_id) {
    try {
      await sql`
        INSERT INTO asset_brands (asset_id, brand_id)
        VALUES (${seed_asset_id}, ${brand.id})
        ON CONFLICT DO NOTHING
      `;
    } catch { /* non-fatal */ }
  }

  // Shape parity with GET — UI consumers expect hero_url. Async
  // enrichment hasn't fired yet at this point, so it's null until
  // the next page load.
  return NextResponse.json({ brand: { ...brand, hero_url: null } });
}
