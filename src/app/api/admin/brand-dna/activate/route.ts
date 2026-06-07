/**
 * POST /api/admin/brand-dna/activate
 * Body: { siteId, source: 'playbook' | 'dna' }
 *
 * Toggles which brand source is active for downstream consumers.
 * Both brand_playbook and brand_dna remain stored — this is a pure flag flip.
 * Reversible at no cost.
 *
 * NOTE — Phase A retirement of brand_playbook (LOCKED 2026-06-07):
 *
 * The parallel-storage architecture (brand_playbook + brand_dna gated by
 * active_brand_source flag) is being collapsed. Post Phase A, brand_dna is
 * the only source and active_brand_source is meaningless. This route
 * retires alongside [[brand-playbook-retirement]] cleanup steps when the
 * active_brand_source column is dropped.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId, source } = await req.json().catch(() => ({}));
  if (!siteId || (source !== "playbook" && source !== "dna")) {
    return NextResponse.json({ error: "siteId and source ('playbook'|'dna') required" }, { status: 400 });
  }

  if (source === "dna") {
    // Guard: don't activate dna if no envelope exists
    const [site] = await sql`SELECT brand_dna FROM businesses WHERE id = ${siteId}`;
    if (!site?.brand_dna) {
      return NextResponse.json({ error: "No Brand DNA generated yet — run Compare first" }, { status: 400 });
    }
  }

  await sql`
    UPDATE businesses
    SET active_brand_source = ${source}, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true, activeSource: source });
}
