import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/sites/[siteId]/reviews
 * Admin trigger to pull and auto-draft reviews for a site.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  const [site] = await sql`SELECT id FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const { syncReviews } = await import("@/lib/inbox/sync-reviews");
  const added = await syncReviews(siteId);

  return NextResponse.json({ success: true, added });
}
