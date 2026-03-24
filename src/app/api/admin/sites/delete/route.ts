import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/sites/delete
 * Body: { siteId, action: "approve" | "deny" }
 *
 * approve: Soft-delete a site (subscriber requested deletion).
 *   Sets deleted_at, disables autopilot + blog, sets deletion_status = 'approved'.
 *
 * deny: Reject the subscriber's deletion request.
 *   Clears deletion fields, site continues as normal.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, action = "approve" } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  if (action === "deny") {
    const [site] = await sql`
      UPDATE sites
      SET deletion_status = NULL,
          deletion_requested_at = NULL,
          deletion_reason = NULL,
          updated_at = NOW()
      WHERE id = ${siteId} AND deletion_status = 'pending' AND deleted_at IS NULL
      RETURNING id, name
    `;
    if (!site) {
      return NextResponse.json({ error: "No pending deletion request found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, siteId, action: "denied", siteName: site.name });
  }

  // Approve: soft delete
  const [site] = await sql`
    SELECT id, name FROM sites
    WHERE id = ${siteId} AND deleted_at IS NULL
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found or already deleted" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET deleted_at = NOW(),
        autopilot_enabled = false,
        deletion_status = 'approved',
        updated_at = NOW()
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
    action: "approved",
    siteName: site.name,
    deletedAt: new Date().toISOString(),
  });
}
