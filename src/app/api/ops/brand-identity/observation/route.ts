/**
 * GET /api/ops/brand-identity/observation?siteId=<uuid>
 *
 * Returns ALL `public_presence_observation` substrate runs for a brand,
 * most-recent first. Per [[ppa-cma-recurring-quality-gate]] PPA is a
 * recurring measurement pass — the run history IS the deliverable, so the
 * UI surfaces all runs as a timeline grid (newest at top, click any row
 * to inspect that snapshot's full observation).
 *
 * Approvals come from the LATEST run only — they represent "what the
 * operator/owner has accepted from the most recent observation as
 * current brand truth." Historical runs render read-only.
 *
 * Backward compat: legacy `observation` field still returned (= latest
 * run) for callers that haven't switched to the runs array yet.
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { listSubstrateRuns } from "@/lib/substrate/store";
import { ensureBrandIdentity } from "@/lib/brand-identity/store";
import { getDescriptorApprovalStatuses } from "@/lib/brand-identity/observation-approve";
import type { BrandIdentityObservationPayload } from "@/lib/brand-identity/aesthetic-observation-types";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Fetch all PPA runs + per-descriptor approval state in parallel.
  const [allRuns, { brandIdentityId }] = await Promise.all([
    listSubstrateRuns<BrandIdentityObservationPayload>(siteId, "public_presence_observation"),
    ensureBrandIdentity(siteId),
  ]);
  const approvals = await getDescriptorApprovalStatuses(brandIdentityId);

  const runs = allRuns.map((row) => ({
    id: row.id,
    runNumber: row.runNumber,
    payload: row.payload,
    generationMetadata: row.generationMetadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  // Backward-compat: latest run mirrored at the legacy `observation` field
  // so any consumer that hasn't switched to the runs array still gets the
  // current snapshot.
  const latest = runs[0] ?? null;

  return NextResponse.json({
    runs,
    observation: latest,
    approvals,
  });
}
