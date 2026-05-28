import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/vendors — list vendors for the active site
 * Query: ?site_id=... (optional, falls back to session activeSiteId)
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ vendors: [] });
  }

  const vendors = await sql`
    SELECT id, name, slug, url, created_at
    FROM entities
    WHERE business_id = ${siteId} AND slot = 1
    ORDER BY name ASC
  `;

  return NextResponse.json({ vendors });
}

/**
 * POST /api/vendors — create a new vendor for a site
 * Body: { name, url?, site_id? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, url, site_id } = body;
  const siteId = site_id;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!siteId) {
    return NextResponse.json({ error: "No site selected" }, { status: 400 });
  }

  // Verify site ownership
  const [site] = await sql`
    SELECT id FROM businesses WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  const [vendor] = await sql`
    INSERT INTO entities (billing_account_id, business_id, name, slug, url, slot)
    VALUES (${auth.subscriptionId}, ${siteId}, ${name.trim()}, ${slug}, ${url || null}, 1)
    ON CONFLICT (business_id, slot, slug) WHERE business_id IS NOT NULL DO UPDATE SET name = ${name.trim()}, url = ${url || null}
    RETURNING id, name, slug, url
  `;

  return NextResponse.json({ vendor });
}
