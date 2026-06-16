/**
 * GET /api/admin/site-services/[siteId]
 *
 * Returns the current services for a site, each annotated with its
 * canonical primary_gcid and (when available) the gbp_categories row
 * the gcid resolves to. Drives the Services tab on
 * /ops/categories-coaching.
 */
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

interface SiteServiceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_range: string | null;
  duration: string | null;
  display_order: number;
  source: string;
  metadata: Record<string, unknown> | null;
  primary_gcid: string | null;
  primary_category_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await ctx.params;

  const services = await sql`
    SELECT
      s.id, s.name, s.slug, s.description, s.price_range, s.duration,
      s.display_order, s.source, s.metadata, s.primary_gcid,
      gc.name AS primary_category_name,
      s.created_at, s.updated_at
    FROM services s
    LEFT JOIN gbp_categories gc ON gc.gcid = s.primary_gcid
    WHERE s.business_id = ${siteId}
    ORDER BY s.display_order, s.name
  `;

  return NextResponse.json({
    services: services as unknown as SiteServiceRow[],
    count: services.length,
  });
}
