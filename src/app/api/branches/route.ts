import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/branches?site_id=...
 * List branches (physical operating units) for a site.
 *
 * Per entity_scoping_principle (LOCKED 2026-05-10): branches are
 * site-scoped operating units (1 business → N branches). The original
 * `locations` table was repurposed to `branches` in migration 110.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ branches: [] });
  }

  const branches = await sql`
    SELECT id, name, slug, address, city, state, description,
           phone, hours, gbp_location_id, is_primary, created_at
    FROM branches WHERE site_id = ${siteId}
    ORDER BY is_primary DESC, name ASC
  `;

  return NextResponse.json({ branches });
}

/**
 * POST /api/branches — create a branch
 * Body: { name, address?, city?, state?, description?, phone?, is_primary?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, address, city, state, description, phone, is_primary, site_id } = body;

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

  const [branch] = await sql`
    INSERT INTO branches (site_id, name, slug, address, city, state, description, phone, is_primary)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${address || null}, ${city || null}, ${state || null}, ${description || null}, ${phone || null}, ${!!is_primary})
    ON CONFLICT (site_id, slug) DO UPDATE SET
      name = ${name.trim()},
      address = ${address || null},
      city = ${city || null},
      state = ${state || null},
      description = ${description || null},
      phone = ${phone || null},
      is_primary = ${!!is_primary}
    RETURNING id, name, slug, address, city, state, description, phone, is_primary
  `;

  // Geo-match: geocode address and backfill matching assets — non-blocking
  const fullAddress = [address, city, state].filter(Boolean).join(", ");
  if (fullAddress) {
    import("@/lib/geo-match").then(({ backfillAssetsForEntity }) =>
      backfillAssetsForEntity("branch", branch.id as string, site_id, fullAddress)
        .then((result) => {
          if (result.matched > 0) {
            console.log(`Geo-matched ${result.matched} assets to branch "${name}"`);
          }
        })
    ).catch(() => {});
  }

  return NextResponse.json({ branch });
}
