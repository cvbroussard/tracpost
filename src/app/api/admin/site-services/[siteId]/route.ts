/**
 * GET /api/admin/site-services/[siteId]
 *
 * Returns the current services for a site, each annotated with:
 *   - primary_gcid + resolved name (the canonical N:1 anchor)
 *   - associated_gcids[] + resolved name array (the cluster's full
 *     curated category set for breadth-tolerant surfaces, per
 *     [[stable-service-identity]])
 *
 * Drives the Services tab on /ops/categories-services.
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
  associated_gcids: string[];
  associated_category_names: Array<{ gcid: string; name: string }>;
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

  // Two-step: services first, then resolve all referenced gcids in
  // one batch (faster than a per-row subquery on a small table).
  const services = await sql`
    SELECT
      s.id, s.name, s.slug, s.description, s.price_range, s.duration,
      s.display_order, s.source, s.metadata, s.primary_gcid,
      s.associated_gcids,
      gc.name AS primary_category_name,
      s.created_at, s.updated_at
    FROM services s
    LEFT JOIN gbp_categories gc ON gc.gcid = s.primary_gcid
    WHERE s.business_id = ${siteId}
    ORDER BY s.display_order, s.name
  `;

  const allReferencedGcids = Array.from(
    new Set(
      services.flatMap((r) => (r.associated_gcids as string[] | null) ?? []),
    ),
  );
  const nameRows =
    allReferencedGcids.length > 0
      ? await sql`
          SELECT gcid, name FROM gbp_categories
          WHERE gcid = ANY(${allReferencedGcids}::text[])
        `
      : [];
  const nameByGcid = new Map(nameRows.map((r) => [r.gcid as string, r.name as string]));

  const enriched = services.map((r) => {
    const associated = (r.associated_gcids as string[] | null) ?? [];
    return {
      ...r,
      associated_gcids: associated,
      associated_category_names: associated.map((gcid) => ({
        gcid,
        name: nameByGcid.get(gcid) ?? gcid,
      })),
    };
  });

  return NextResponse.json({
    services: enriched as unknown as SiteServiceRow[],
    count: enriched.length,
  });
}
