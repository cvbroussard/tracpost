import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/pipeline/health?site_id=xxx
 *
 * Returns pipeline health metrics for a site:
 * - triaged_count: assets ready to fill slots
 * - open_slots_7d: unfilled slots in the next 7 days
 * - scheduled_count: posts scheduled but not yet published
 * - recent_uploads: last 5 uploads with status
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("site_id");

  if (!siteId) {
    return NextResponse.json(
      { error: "site_id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    const [site] = await sql`
      SELECT id FROM businesses
      WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
    `;

    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    const sevenDaysFromNow = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [counts, recentUploads] = await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM media_assets
           WHERE business_id = ${siteId} AND processing_stage = 'briefed') AS triaged_count,
          (SELECT COUNT(*)::int FROM publishing_slots
           WHERE business_id = ${siteId} AND status = 'open'
             AND scheduled_at <= ${sevenDaysFromNow}) AS open_slots_7d,
          (SELECT COUNT(*)::int FROM social_posts sp
           JOIN social_accounts sa ON sp.account_id = sa.id
           WHERE sa.business_id = ${siteId} AND sp.status = 'scheduled') AS scheduled_count,
          (SELECT COUNT(*)::int FROM media_assets
           WHERE business_id = ${siteId} AND processing_stage = 'onboarded') AS pending_count
      `,
      sql`
        SELECT id, storage_url AS url, media_type, context_note, processing_stage, created_at
        FROM media_assets
        WHERE business_id = ${siteId}
        ORDER BY created_at DESC
        LIMIT 5
      `,
    ]);

    const c = counts[0];

    return NextResponse.json({
      triaged_count: c.triaged_count,
      open_slots_7d: c.open_slots_7d,
      scheduled_count: c.scheduled_count,
      pending_count: c.pending_count,
      recent_uploads: recentUploads,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
