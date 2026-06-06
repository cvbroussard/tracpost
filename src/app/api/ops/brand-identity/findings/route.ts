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
import { getFindingResolutions } from "@/lib/brand-identity/readiness-finding-resolutions";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const [row, updatedAt, resolutions] = await Promise.all([
    getReadinessFindingsWithId(siteId),
    getReadinessFindingsUpdatedAt(siteId),
    getFindingResolutions(siteId),
  ]);
  return NextResponse.json({
    findings: row?.payload ?? null,
    findingsSubstrateId: row?.id ?? null,
    updatedAt,
    resolutions,
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
