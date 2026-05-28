import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/services?site_id=...
 * List services for a site (subscriber-managed offerings).
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ services: [] });
  }

  const services = await sql`
    SELECT id, name, slug, description, price_range, duration, display_order,
           hero_asset_id, metadata, source, created_at, updated_at
    FROM services WHERE business_id = ${siteId}
    ORDER BY display_order ASC, name ASC
  `;

  return NextResponse.json({ services });
}

/**
 * POST /api/services — create a service
 * Body: { name, description?, price_range?, duration?, display_order?,
 *         hero_asset_id?, metadata?, source?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, description, price_range, duration, display_order,
    hero_asset_id, metadata, source, site_id } = body;

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

  const metadataJson = metadata
    ? typeof metadata === "string"
      ? metadata
      : JSON.stringify(metadata)
    : "{}";

  const [service] = await sql`
    INSERT INTO services (business_id, name, slug, description, price_range, duration,
      display_order, hero_asset_id, metadata, source)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${description || null},
      ${price_range || null}, ${duration || null},
      ${display_order || 0}, ${hero_asset_id || null},
      ${metadataJson}::jsonb, ${source || "manual"})
    ON CONFLICT (business_id, slug) DO UPDATE SET
      name = ${name.trim()},
      description = ${description || null},
      price_range = ${price_range || null},
      duration = ${duration || null},
      display_order = ${display_order || 0},
      hero_asset_id = ${hero_asset_id || null},
      metadata = ${metadataJson}::jsonb,
      source = ${source || "manual"}
    RETURNING id, name, slug, description, price_range, duration, display_order,
              hero_asset_id, metadata, source
  `;

  return NextResponse.json({ service });
}
