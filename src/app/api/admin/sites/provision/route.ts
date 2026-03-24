import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/sites/provision
 * Body: { siteId, action: "start" | "complete" }
 *
 * Advance provisioning status:
 *   requested → in_progress (admin starts work)
 *   in_progress → complete (admin finished)
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, action } = body;

  if (!siteId || !action) {
    return NextResponse.json({ error: "siteId and action required" }, { status: 400 });
  }

  if (action === "start") {
    const [site] = await sql`
      UPDATE sites
      SET provisioning_status = 'in_progress', updated_at = NOW()
      WHERE id = ${siteId} AND provisioning_status = 'requested' AND deleted_at IS NULL
      RETURNING id, name
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found or not in requested state" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, siteId, status: "in_progress" });
  }

  if (action === "complete") {
    const [site] = await sql`
      UPDATE sites
      SET provisioning_status = 'complete', updated_at = NOW()
      WHERE id = ${siteId} AND provisioning_status = 'in_progress' AND deleted_at IS NULL
      RETURNING id, name
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found or not in_progress" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, siteId, status: "complete" });
  }

  return NextResponse.json({ error: "Invalid action. Use 'start' or 'complete'" }, { status: 400 });
}
