import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/competitive-analysis/[siteId]
 *
 * Returns ALL CMA runs for a site (newest first). Per
 * [[ppa-cma-recurring-quality-gate]] CMA is a recurring measurement
 * pass — the run history IS the deliverable. The UI surfaces all
 * runs as a timeline grid + trajectory chart; the body renders the
 * selected run's full payload.
 *
 * Backward compat: the legacy `analysis` field still returns the
 * latest run for any callers that haven't switched to the runs array
 * (in particular the polling loop in the CMA drawer button uses
 * `analysis.status` to detect completion).
 *
 * Response:
 *   {
 *     runs: Array<{ id, runNumber, runPurpose, status, generatedAt,
 *                   updatedAt, errorMessage, data, catalogSnapshotAt }>,
 *     analysis: <latest run> | null,
 *     latestRunNumber: number | null,
 *   }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  const rows = await sql`
    SELECT id, run_number, run_purpose, status, generated_at, error_message,
           analysis_data, catalog_snapshot_at, website_last_regen_at, updated_at
    FROM competitive_market_analyses
    WHERE business_id = ${siteId}
    ORDER BY run_number DESC NULLS LAST, generated_at DESC
  `;

  const runs = rows.map((row) => ({
    id: row.id,
    runNumber: row.run_number,
    runPurpose: row.run_purpose,
    status: row.status,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    data: row.analysis_data,
    catalogSnapshotAt: row.catalog_snapshot_at,
    websiteLastRegenAt: row.website_last_regen_at,
  }));

  const latest = runs[0] ?? null;

  return NextResponse.json({
    runs,
    // Legacy field — kept for the CMA "Run Analysis" polling loop in the
    // provisioning drawer which checks `analysis.status` to detect completion.
    analysis: latest,
    latestRunNumber: latest?.runNumber ?? null,
  });
}
