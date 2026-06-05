/**
 * GET /api/ops/brand-identity/observation?siteId=<uuid>
 *
 * Returns the current `public_presence_observation` substrate row for a brand,
 * or { observation: null } when none has been generated yet. Used by the
 * Phase 3 owner review surface to render the agency-assessment deliverable
 * (public presence analysis — what TracPost found in the wild for this brand).
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { getSubstrate } from "@/lib/substrate/store";
import type { BrandIdentityObservationPayload } from "@/lib/brand-identity/aesthetic-observation-types";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const row = await getSubstrate<BrandIdentityObservationPayload>(
    siteId,
    "public_presence_observation",
  );
  return NextResponse.json({
    observation: row
      ? {
          id: row.id,
          payload: row.payload,
          generationMetadata: row.generationMetadata,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : null,
  });
}
