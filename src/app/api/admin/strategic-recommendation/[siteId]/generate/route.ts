import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  loadStrategicInputs,
  generateStatisticalRecommendation,
  persistStrategicRecommendation,
  type BrandBasics,
} from "@/lib/brand-identity/statistical-recommendation";

export const runtime = "nodejs";
// One Opus 4.7 call with ~6k max_tokens lands in 20-40s typical, 60s+
// worst case. Synchronous request/response (no fire-and-poll) since the
// pipeline is a single LLM call — no intermediate status to track.
export const maxDuration = 120;

/**
 * POST /api/admin/strategic-recommendation/[siteId]/generate
 *
 * Generates a fresh Statistical Recommendation bundle (Offer / Audience /
 * Positioning / Hooks / Tagline / CTA) for a business and persists it
 * to strategic_recommendations.
 *
 * Prerequisites:
 *   - A completed CMA exists for the business (status='complete')
 *   - A primary brand_identity record exists for the business
 *   - businesses.name is set
 * If any is missing, returns 400 with a typed error reason.
 *
 * Brand basics (founder_name, founding_year, origin_context) are read
 * canonically from the businesses table per migration 140. An optional
 * body `override` layers on top — useful when ops wants to test with
 * enriched values before backfilling the canonical columns.
 *
 * Body (optional):
 *   {
 *     override?: {
 *       ownerName?: string,
 *       foundingYear?: number,
 *       originContext?: string
 *     }
 *   }
 *
 * Response:
 *   200 { id, bundle }       — bundle generated + persisted
 *   400 { error, reason }    — prerequisites missing
 *   401 { error }            — auth failure
 *   500 { error }            — LLM call or persistence failure
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  // Parse optional override — fields layer on top of canonical DB values
  let override: Partial<BrandBasics> = {};
  try {
    const body = (await req.json()) as { override?: Partial<BrandBasics> };
    override = body.override ?? {};
  } catch {
    // No body is fine — engine reads canonical from DB
  }

  // Engine loads brand basics + CMA + brand identity + creative declarations
  const inputsResult = await loadStrategicInputs(siteId, override);
  if (!inputsResult.ok) {
    return NextResponse.json(
      { error: inputsResult.message, reason: inputsResult.reason },
      { status: 400 },
    );
  }

  // Generate the bundle — one Opus call, returns parsed bundle + persistence payload
  let generation;
  try {
    generation = await generateStatisticalRecommendation(inputsResult.inputs);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown LLM error";
    console.error("Strategic recommendation generation failed:", message);
    return NextResponse.json(
      { error: "LLM generation failed", detail: message },
      { status: 500 },
    );
  }

  // Persist — engine returns { bundle, persistence }; writer takes both
  let persisted;
  try {
    persisted = await persistStrategicRecommendation(
      siteId,
      generation.bundle,
      generation.persistence,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown persistence error";
    console.error("Strategic recommendation persistence failed:", message);
    return NextResponse.json(
      { error: "Failed to persist recommendation", detail: message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: persisted.id,
    bundle: generation.bundle,
  });
}
