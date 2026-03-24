import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/sites/delete
 * Body: { siteId }
 *
 * Soft-delete a site: sets deleted_at, disables autopilot, disables blog.
 * Data is preserved for 30 days before hard purge.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Verify site exists and isn't already deleted
  const [site] = await sql`
    SELECT id, name, subscriber_id FROM sites
    WHERE id = ${siteId} AND deleted_at IS NULL
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found or already deleted" }, { status: 404 });
  }

  // Soft delete: mark deleted, disable autopilot, disable blog
  await sql`
    UPDATE sites
    SET deleted_at = NOW(), autopilot_enabled = false, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  await sql`
    UPDATE blog_settings
    SET blog_enabled = false, updated_at = NOW()
    WHERE site_id = ${siteId}
  `;

  return NextResponse.json({
    ok: true,
    siteId,
    siteName: site.name,
    deletedAt: new Date().toISOString(),
  });
}
