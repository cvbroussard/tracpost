import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/competitive-analysis/[siteId]
 *
 * Returns the most recent analysis record for a site (any status).
 * Used by the operator UI to poll progress after triggering a run +
 * to render completed analyses.
 *
 * Response:
 *   {
 *     id, status, generated_at, error_message?,
 *     analysis_data?: AnalysisPayload (when status=complete)
 *   }
 *   or { analysis: null } if no analysis has been triggered for the site yet
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  const [row] = await sql`
    SELECT id, status, generated_at, error_message, analysis_data, updated_at
    FROM competitive_market_analyses
    WHERE business_id = ${siteId}
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  if (!row) {
    return NextResponse.json({ analysis: null });
  }

  return NextResponse.json({
    analysis: {
      id: row.id,
      status: row.status,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      data: row.analysis_data,
    },
  });
}
