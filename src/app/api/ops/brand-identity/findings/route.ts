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
  getReadinessFindings,
  getReadinessFindingsUpdatedAt,
} from "@/lib/brand-identity/readiness-findings-consolidator";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const [payload, updatedAt] = await Promise.all([
    getReadinessFindings(siteId),
    getReadinessFindingsUpdatedAt(siteId),
  ]);
  return NextResponse.json({ findings: payload, updatedAt });
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
