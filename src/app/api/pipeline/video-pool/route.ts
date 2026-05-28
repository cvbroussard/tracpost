import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/pipeline/video-pool
 *
 * Video pool generator cron — runs every 3 hours.
 * Evaluates each active site for hero-class photos that need
 * video derivatives, generates up to 1 per site per cycle.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await sql`
    SELECT id, name FROM businesses
    WHERE autopilot_enabled = true
      AND is_active = true
      AND provisioning_status = 'complete'
  `;

  const { evaluateAndGenerate } = await import("@/lib/pipeline/video-pool");

  const results = [];
  for (const site of sites) {
    try {
      const r = await evaluateAndGenerate(site.id as string);
      results.push({ site: site.name, ...r });
    } catch (err) {
      results.push({
        site: site.name,
        siteId: site.id,
        generated: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
