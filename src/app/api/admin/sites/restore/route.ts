import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/sites/restore
 * Body: { siteId }
 *
 * Restore a soft-deleted site: clears deleted_at.
 * Does NOT re-enable autopilot or blog — admin must do that manually.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id, name FROM sites
    WHERE id = ${siteId} AND deleted_at IS NOT NULL
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found or not deleted" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET deleted_at = NULL, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({
    ok: true,
    siteId,
    siteName: site.name,
  });
}
