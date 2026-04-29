/**
 * POST /api/admin/brand-dna/activate
 * Body: { siteId, source: 'playbook' | 'dna' }
 *
 * Toggles which brand source is active for downstream consumers.
 * Both brand_playbook and brand_dna remain stored — this is a pure flag flip.
 * Reversible at no cost.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId, source } = await req.json().catch(() => ({}));
  if (!siteId || (source !== "playbook" && source !== "dna")) {
    return NextResponse.json({ error: "siteId and source ('playbook'|'dna') required" }, { status: 400 });
  }

  if (source === "dna") {
    // Guard: don't activate dna if no envelope exists
    const [site] = await sql`SELECT brand_dna FROM sites WHERE id = ${siteId}`;
    if (!site?.brand_dna) {
      return NextResponse.json({ error: "No Brand DNA generated yet — run Compare first" }, { status: 400 });
    }
  }

  await sql`
    UPDATE sites
    SET active_brand_source = ${source}, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true, activeSource: source });
}
