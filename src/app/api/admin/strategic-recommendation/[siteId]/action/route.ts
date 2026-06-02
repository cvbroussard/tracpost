import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import {
  approveStrategicRecommendation,
  setStrategicRecommendationAction,
  type OwnerAction,
} from "@/lib/brand-identity/statistical-recommendation";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/strategic-recommendation/[siteId]/action
 *
 * Updates the owner_action lifecycle on a strategic recommendation.
 * For "approved", also atomically writes the bundle into the 6
 * brand_descriptor.declared rows for the Statistical bucket.
 *
 * Body:
 *   {
 *     recId: string,         // the strategic_recommendations.id to act on
 *     action: "approved" | "rejected" | "refined"
 *   }
 *
 * Response:
 *   200 { ok: true, descriptorsWritten?, skipped? }
 *   400 { error }                  — body shape, action enum, or rec/site mismatch
 *   401 { error }
 *   404 { error }                  — rec not found
 *
 * Note: "refined" is a placeholder for the refinement drill-down flow
 * (per-element re-prompt with a separate system prompt). For now it
 * just flips the lifecycle without writing declared.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  let body: { recId?: string; action?: OwnerAction };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recId = body.recId;
  const action = body.action;
  if (!recId || typeof recId !== "string") {
    return NextResponse.json({ error: "recId is required" }, { status: 400 });
  }
  if (!action || !["approved", "rejected", "refined"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: approved, rejected, refined" },
      { status: 400 },
    );
  }

  // Verify the rec belongs to the claimed site — prevents cross-site
  // mutation if the UI ever surfaces wrong-business rec IDs.
  const [recRow] = await sql`
    SELECT business_id FROM strategic_recommendations WHERE id = ${recId} LIMIT 1
  `;
  if (!recRow) {
    return NextResponse.json({ error: "Strategic recommendation not found" }, { status: 404 });
  }
  if (recRow.business_id !== siteId) {
    return NextResponse.json(
      { error: "Recommendation does not belong to this business" },
      { status: 400 },
    );
  }

  try {
    if (action === "approved") {
      const result = await approveStrategicRecommendation(recId);
      return NextResponse.json(result);
    }

    // rejected | refined — lifecycle flip only
    const ok = await setStrategicRecommendationAction(recId, action);
    return NextResponse.json({ ok });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Strategic recommendation action failed:", message);
    return NextResponse.json(
      { error: "Action failed", detail: message },
      { status: 500 },
    );
  }
}
