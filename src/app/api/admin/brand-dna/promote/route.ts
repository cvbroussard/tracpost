/**
 * POST /api/admin/brand-dna/promote
 * Body: { siteId, playbook }
 * Writes the supplied playbook to sites.brand_playbook. Use after
 * the operator inspects compare output and decides v2 is the better
 * choice. Backs up the previous playbook to brand_wizard_state before
 * overwriting so promotion is reversible within the wizard.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId, playbook } = await req.json().catch(() => ({}));
  if (!siteId || !playbook || typeof playbook !== "object") {
    return NextResponse.json({ error: "siteId and playbook required" }, { status: 400 });
  }

  // Snapshot the current playbook so the promotion is reversible
  const [current] = await sql`SELECT brand_playbook FROM sites WHERE id = ${siteId}`;
  if (!current) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const backup = {
    previous_playbook: current.brand_playbook,
    backed_up_at: new Date().toISOString(),
    reason: "v2 promotion",
  };

  await sql`
    UPDATE sites
    SET brand_playbook = ${JSON.stringify(playbook)}::jsonb,
        brand_wizard_state = ${JSON.stringify(backup)}::jsonb,
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true });
}
