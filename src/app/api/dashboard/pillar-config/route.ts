import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { validatePillarConfig, logMalformedAttempt } from "@/lib/pillars/validate";

/**
 * POST /api/dashboard/pillar-config
 * Body: { siteId, config }
 *
 * Save the two-tier pillar+tag configuration for a site.
 *
 * Per the framework lock 2026-05-08: incoming config is validated against
 * the 5 framework IDs (what/how/who/proof/why). Non-framework IDs are
 * rejected with 400 + logged to subscriber_actions.pillar_config_rejected.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { siteId, config } = body;

  if (!siteId || !config) {
    return NextResponse.json({ error: "siteId and config required" }, { status: 400 });
  }

  const validation = validatePillarConfig(config);
  if (!validation.ok) {
    await logMalformedAttempt(siteId, "/api/dashboard/pillar-config", validation.invalidIds, config);
    return NextResponse.json(
      { error: "Malformed pillar config", details: validation.message },
      { status: 400 },
    );
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id FROM sites
    WHERE id = ${siteId} AND subscription_id = ${session.subscriptionId}
  `;

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
