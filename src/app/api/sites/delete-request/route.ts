import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/sites/delete-request
 * Body: { siteId, reason? }
 *
 * Subscriber requests deletion of a site. Creates a pending request
 * for the platform operator to review and approve.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { siteId, reason } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id, name FROM sites
    WHERE id = ${siteId}
      AND subscriber_id = ${session.subscriberId}
      AND deleted_at IS NULL
      AND deletion_status IS NULL
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found or already pending deletion" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET deletion_requested_at = NOW(),
        deletion_reason = ${reason || null},
        deletion_status = 'pending',
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({
    ok: true,
    siteId,
    status: "pending",
  });
}

/**
 * DELETE /api/sites/delete-request
 * Body: { siteId }
 *
 * Subscriber cancels a pending deletion request.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { siteId } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites
    WHERE id = ${siteId}
      AND subscriber_id = ${session.subscriberId}
      AND deletion_status = 'pending'
  `;

  if (!site) {
    return NextResponse.json({ error: "No pending request found" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET deletion_requested_at = NULL,
        deletion_reason = NULL,
        deletion_status = NULL,
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ ok: true, siteId });
}
