import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/blog/cron — Daily article generation via v2 autopilot.
 *
 * REWIRED 2026-05-08 (#155): retired v1 blog-generator path. This cron now
 * dispatches to v2's runAutopilot, which handles weighted-random pool
 * selection (blog / project_chapter / service) and self-persists to
 * blog_posts_v2 / projects_v2 / services_v2.
 *
 * Auth via CRON_SECRET (Vercel cron sends Authorization: Bearer).
 *
 * For each site with autopilot enabled + cadence > 0 + cadence-due:
 *   1. Call runAutopilot(siteId)
 *   2. Log result (which pool ran, what was generated, any errors)
 *
 * Cadence check: 7/cadence days since last v2 article (any pool counts).
 *
 * Time-bounded: ~4 minute safety budget; remaining sites pushed to next run.
 */
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startTime = Date.now();
  const MAX_RUNTIME_MS = 240_000;

  const sites = await sql`
    SELECT s.id, s.name, s.blog_cadence
    FROM businesses s
    WHERE s.is_active = true
      AND s.autopilot_enabled = true
      AND s.blog_cadence > 0
    ORDER BY s.created_at ASC
  `;

  const results: Array<{ siteId: string; siteName: string; action: string }> = [];

  for (const site of sites) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      results.push({
        siteId: site.id as string,
        siteName: site.name as string,
        action: "skipped — time limit",
      });
      break;
    }

    const siteId = site.id as string;
    const cadence = (site.blog_cadence as number) || 0;
    if (cadence === 0) continue;

    try {
      // Cadence: count any v2 article (blog / project_chapter / service) as
      // a publish event for cadence purposes. Subscribers expect "X per week"
      // total cadence, not per-pool cadence.
      const [lastV2] = await sql`
        SELECT created_at FROM (
          SELECT created_at FROM blog_posts_v2 WHERE business_id = ${siteId}
          UNION ALL
          SELECT created_at FROM projects_v2 WHERE business_id = ${siteId}
          UNION ALL
          SELECT created_at FROM services_v2 WHERE business_id = ${siteId}
        ) t
        ORDER BY created_at DESC LIMIT 1
      `;

      const intervalDays = 7 / cadence;
      const lastDate = lastV2?.created_at ? new Date(lastV2.created_at as string) : new Date(0);
      const daysSinceLast = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLast < intervalDays) {
        results.push({
          siteId,
          siteName: site.name as string,
          action: `not due (${daysSinceLast.toFixed(1)}d since last, interval ${intervalDays.toFixed(1)}d)`,
        });
        continue;
      }

      // Dispatch to v2 autopilot
      const { runAutopilot } = await import("@/lib/v2-generator/orchestrator/autopilot");
      const result = await runAutopilot(siteId);
      results.push({
        siteId,
        siteName: site.name as string,
        action: `${result.pool}: ${result.reason}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ siteId, siteName: site.name as string, action: `error: ${msg}` });
    }
  }

  return NextResponse.json({
    processed: results.length,
    runtime_ms: Date.now() - startTime,
    results,
  });
}
