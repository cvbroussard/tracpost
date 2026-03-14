import { NextRequest, NextResponse } from "next/server";
import { runAllPipelines } from "@/lib/pipeline/orchestrator";
import { refreshExpiringTokens } from "@/lib/pipeline/token-refresh";

/**
 * GET /api/pipeline/cron — Run autopilot pipeline for all enabled sites.
 *
 * Secured by CRON_SECRET header (Vercel Cron or external scheduler).
 * Not subscriber-authenticated — this is a system-level endpoint.
 *
 * Also refreshes any social account tokens expiring within 7 days.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");

  if (!process.env.CRON_SECRET || secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Refresh expiring tokens first
    const tokenResult = await refreshExpiringTokens();

    // Run all pipelines
    const results = await runAllPipelines();

    const summary = {
      sites_processed: results.length,
      total_triaged: results.reduce((n, r) => n + r.assetsTriaged, 0),
      total_slots_generated: results.reduce((n, r) => n + r.slotsGenerated, 0),
      total_slots_filled: results.reduce((n, r) => n + r.slotsFilled, 0),
      total_captions: results.reduce((n, r) => n + r.captionsGenerated, 0),
      total_published: results.reduce((n, r) => n + r.postsPublished, 0),
      total_failed: results.reduce((n, r) => n + r.postsFailed, 0),
      tokens_refreshed: tokenResult.refreshed,
      tokens_failed: tokenResult.failed,
      errors: results.flatMap((r) => r.errors),
    };

    return NextResponse.json({ summary, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
