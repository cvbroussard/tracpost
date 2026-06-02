import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
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
 * If either is missing, returns 400 with a typed error reason.
 *
 * Body (optional):
 *   {
 *     basics?: {
 *       ownerName?: string,
 *       foundingYear?: number,
 *       originContext?: string
 *     }
 *   }
 *   businessName is always derived from businesses.name — operator
 *   does not override. ownerName / foundingYear / originContext are
 *   accepted in the body because the businesses table does not carry
 *   them as first-class columns; UI may pass enriched values when
 *   available.
 *
 * Response:
 *   200 { id, bundle }       — bundle generated + persisted
 *   400 { error, reason }    — prerequisites missing
 *   401 { error }            — auth failure
 *   404 { error }            — business not found
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

  // Look up the businesses.name (required for BrandBasics.businessName).
  // Fail fast with 404 if the business doesn't exist.
  const [businessRow] = await sql`
    SELECT name FROM businesses WHERE id = ${siteId} LIMIT 1
  `;
  if (!businessRow) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const businessName = (businessRow.name as string | null) ?? "";
  if (!businessName.trim()) {
    return NextResponse.json(
      { error: "Business has no name set — cannot generate strategic recommendation" },
      { status: 400 },
    );
  }

  // Parse optional body — operator can supply enriched basics
  let bodyBasics: Partial<Pick<BrandBasics, "ownerName" | "foundingYear" | "originContext">> = {};
  try {
    const body = (await req.json()) as { basics?: typeof bodyBasics };
    bodyBasics = body.basics ?? {};
  } catch {
    // No body is fine — defaults apply
  }

  const basics: BrandBasics = {
    businessName,
    ownerName: bodyBasics.ownerName ?? null,
    foundingYear: bodyBasics.foundingYear ?? null,
    originContext: bodyBasics.originContext ?? null,
  };

  // Load CMA + brand identity + creative declarations
  const inputsResult = await loadStrategicInputs(siteId, basics);
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
