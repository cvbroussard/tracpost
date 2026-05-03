import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/google/categories?site_id=xxx — get site's categories
 * GET /api/google/categories?search=xxx — search category pool
 * POST /api/google/categories — add/remove/set primary
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");
  const search = params.get("search");

  if (search) {
    const pattern = `%${search}%`;
    const results = await sql`
      SELECT gcid, name FROM gbp_categories
      WHERE name ILIKE ${pattern}
      ORDER BY name
      LIMIT 20
    `;
    return NextResponse.json({ categories: results });
  }

  if (!siteId) {
    return NextResponse.json({ error: "site_id or search required" }, { status: 400 });
  }

  const categories = await sql`
    SELECT sgc.id, sgc.gcid, sgc.is_primary, sgc.reasoning, gc.name
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId}
    ORDER BY sgc.is_primary DESC, gc.name
  `;

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  const sessionCookie = req.cookies.get("tp_session")?.value;
  if (!verifyCookie(adminCookie) && !sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { site_id, action, gcid } = await req.json();

  if (!site_id || !action) {
    return NextResponse.json({ error: "site_id and action required" }, { status: 400 });
  }

  if (action === "add" && gcid) {
    const [count] = await sql`
      SELECT COUNT(*)::int AS total FROM site_gbp_categories WHERE site_id = ${site_id}
    `;
    if (count.total >= 10) {
      return NextResponse.json({ error: "Maximum 10 categories (1 primary + 9 additional)" }, { status: 400 });
    }

    const isPrimary = count.total === 0;

    await sql`
      INSERT INTO site_gbp_categories (site_id, gcid, is_primary, chosen_by)
      VALUES (${site_id}, ${gcid}, ${isPrimary}, 'operator')
      ON CONFLICT DO NOTHING
    `;
    await sql`UPDATE sites SET gbp_sync_dirty = true, gbp_dirty_fields = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(gbp_dirty_fields, '{}') || ARRAY['categories']))) WHERE id = ${site_id}`;

    return NextResponse.json({ success: true });
  }

  if (action === "remove" && gcid) {
    const [removed] = await sql`
      DELETE FROM site_gbp_categories
      WHERE site_id = ${site_id} AND gcid = ${gcid}
      RETURNING is_primary
    `;

    if (removed?.is_primary) {
      await sql`
        UPDATE site_gbp_categories
        SET is_primary = true
        WHERE id = (
          SELECT id FROM site_gbp_categories
          WHERE site_id = ${site_id}
          ORDER BY chosen_at ASC
          LIMIT 1
        )
      `;
    }
    await sql`UPDATE sites SET gbp_sync_dirty = true, gbp_dirty_fields = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(gbp_dirty_fields, '{}') || ARRAY['categories']))) WHERE id = ${site_id}`;

    return NextResponse.json({ success: true });
  }

  if (action === "set_primary" && gcid) {
    await sql`
      UPDATE site_gbp_categories SET is_primary = false WHERE site_id = ${site_id}
    `;
    await sql`
      UPDATE site_gbp_categories SET is_primary = true WHERE site_id = ${site_id} AND gcid = ${gcid}
    `;
    await sql`UPDATE sites SET gbp_sync_dirty = true, gbp_dirty_fields = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(gbp_dirty_fields, '{}') || ARRAY['categories']))) WHERE id = ${site_id}`;

    return NextResponse.json({ success: true });
  }

  if (action === "push_to_google") {
    // Push categories to GBP via API
    try {
      const { pushCategoriesToGoogle } = await import("@/lib/gbp/profile");
      const result = await pushCategoriesToGoogle(site_id);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : "Push failed",
      }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
