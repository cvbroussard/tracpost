import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/projects?site_id=...
 * List projects for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await sql`
    SELECT id, name, slug, status, start_date, end_date, address, description,
           hero_asset_id, metadata, caption_mode, manual_caption_count,
           place_id, gps_lat, gps_lng, created_at
    FROM projects WHERE business_id = ${siteId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ projects });
}

/**
 * POST /api/projects — create a project
 * Body: { name, status?, start_date?, end_date?, address?, description?,
 *         hero_asset_id?, metadata?, caption_mode?, site_id,
 *         place_id?, gps_lat?, gps_lng? }
 *
 * place_id + gps_lat + gps_lng are set when the subscriber uses the
 * LocationPicker (autocomplete returns these from Google Places). Stored
 * directly — no server-side geocoding needed. Powers the project geo
 * matcher (per project_tracpost_project_geo_matcher memory).
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, status, start_date, end_date, address, description,
    hero_asset_id, metadata, caption_mode, site_id,
    place_id, gps_lat, gps_lng } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM businesses WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  const metadataJson = metadata ? JSON.stringify(metadata) : "{}";

  const [project] = await sql`
    INSERT INTO projects (business_id, name, slug, status, start_date, end_date,
      address, description, hero_asset_id, metadata, caption_mode,
      place_id, gps_lat, gps_lng)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${status || "active"},
      ${start_date || null}, ${end_date || null}, ${address || null},
      ${description || null}, ${hero_asset_id || null},
      ${metadataJson}::jsonb, ${caption_mode || "seeding"},
      ${place_id || null}, ${gps_lat ?? null}, ${gps_lng ?? null})
    ON CONFLICT (business_id, slug) DO UPDATE SET
      name = ${name.trim()},
      status = ${status || "active"},
      address = ${address || null},
      description = ${description || null},
      hero_asset_id = ${hero_asset_id || null},
      metadata = ${metadataJson}::jsonb,
      caption_mode = ${caption_mode || "seeding"},
      place_id = ${place_id || null},
      gps_lat = ${gps_lat ?? null},
      gps_lng = ${gps_lng ?? null}
    RETURNING id, name, slug, status, start_date, end_date, address, description,
              hero_asset_id, metadata, caption_mode, manual_caption_count,
              place_id, gps_lat, gps_lng
  `;

  // Geo-match backfill — only call legacy path if client didn't supply
  // direct lat/lng. The LocationPicker provides them inline (no
  // geocoding needed); legacy address-only callers still get the
  // server-side geocode + backfill path.
  if (address && (gps_lat == null || gps_lng == null)) {
    import("@/lib/geo-match").then(({ backfillAssetsForEntity }) =>
      backfillAssetsForEntity("project", project.id as string, site_id, address)
        .then((result) => {
          if (result.matched > 0) {
            console.log(`Geo-matched ${result.matched} assets to project "${name}"`);
          }
        })
    ).catch(() => {});
  }

  return NextResponse.json({ project });
}
