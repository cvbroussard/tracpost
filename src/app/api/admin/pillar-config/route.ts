import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { validatePillarConfig, logMalformedAttempt } from "@/lib/pillars/validate";

/**
 * POST /api/admin/pillar-config
 * Body: { siteId, config }
 *
 * Admin saves pillar+tag config for any site.
 * No subscriber auth check — admin cookie only.
 *
 * Per the framework lock 2026-05-08: incoming config is validated against
 * the 5 framework IDs (what/how/who/proof/why). Non-framework IDs are
 * rejected with 400 + logged to subscriber_actions.pillar_config_rejected.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, config } = body;

  if (!siteId || !config) {
    return NextResponse.json({ error: "siteId and config required" }, { status: 400 });
  }

  const validation = validatePillarConfig(config);
  if (!validation.ok) {
    await logMalformedAttempt(siteId, "/api/admin/pillar-config", validation.invalidIds, config);
    return NextResponse.json(
      { error: "Malformed pillar config", details: validation.message },
      { status: 400 },
    );
  }

  const [site] = await sql`SELECT id FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  await sql`
    UPDATE sites
    SET pillar_config = ${JSON.stringify(config)}::jsonb, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ ok: true });
}
