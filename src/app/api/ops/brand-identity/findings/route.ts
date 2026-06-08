/**
 * GET  /api/ops/brand-identity/findings?siteId=<uuid>
 *   Returns the current readiness_findings substrate, or { findings: null }
 *   when none has been generated yet.
 *
 * POST /api/ops/brand-identity/findings { siteId }
 *   Triggers consolidation: reads the public_presence_observation substrate,
 *   transforms it into ReadinessFinding[], persists as readiness_findings.
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  consolidateReadinessFindings,
  getReadinessFindingsWithId,
  getReadinessFindingsUpdatedAt,
} from "@/lib/brand-identity/readiness-findings-consolidator";
import {
  getFindingResolutions,
  computeFindingLifecycle,
} from "@/lib/brand-identity/readiness-finding-resolutions";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const [row, updatedAt, resolutions, lifecycle] = await Promise.all([
    getReadinessFindingsWithId(siteId),
    getReadinessFindingsUpdatedAt(siteId),
    getFindingResolutions(siteId),
    computeFindingLifecycle(siteId),
  ]);
  // Re-key lifecycle entries by finding_id for O(1) UI lookups.
  const lifecycleByFindingId: Record<string, typeof lifecycle.lifecycles[number]> = {};
  for (const lc of lifecycle.lifecycles) lifecycleByFindingId[lc.findingId] = lc;
  return NextResponse.json({
    findings: row?.payload ?? null,
    findingsSubstrateId: row?.id ?? null,
    updatedAt,
    resolutions,
    lifecycle: lifecycleByFindingId,
    latestRunNumber: lifecycle.latestRunNumber,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = (await req.json()) ?? {};
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const result = await consolidateReadinessFindings({ businessId: siteId });
  return NextResponse.json(result);
}
