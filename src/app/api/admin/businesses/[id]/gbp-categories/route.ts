/**
 * Admin endpoint — read the canonical GBP category assignment for a brand.
 *
 * Read-only. Categorization is a platform-owned, derived assignment; the
 * tenant never picks from the 4000-category dropdown. Provenance
 * (chosen_by: 'coaching' | other) and timestamp are returned so the
 * drawer can distinguish coaching-ceremony output from auto-categorization.
 *
 * Per the theoretical model: business_gbp_categories is THE canonical
 * store. CMA + GBP profile sync + schema.org metadata + service tile
 * anchoring all read from here. To update, run either:
 *   - POST /api/admin/sites/[siteId]/services/regenerate {step: 'categorize'}
 *     (Pipeline A — auto from catalog signals)
 *   - The coaching ceremony at /ops/categories-coaching
 *     (Pipeline B — CMA-informed, higher quality)
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const rows = await sql`
    SELECT sgc.gcid, sgc.is_primary, sgc.chosen_by, sgc.chosen_at, gc.name
    FROM business_gbp_categories sgc
    LEFT JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${id}
    ORDER BY sgc.is_primary DESC, gc.name ASC
  `;

  return NextResponse.json({
    categories: rows.map((r) => ({
      gcid: r.gcid as string,
      name: (r.name as string | null) ?? (r.gcid as string),
      isPrimary: !!r.is_primary,
      chosenBy: (r.chosen_by as string | null) ?? null,
      chosenAt: (r.chosen_at as Date | null)?.toISOString() ?? null,
    })),
  });
}
