/**
 * POST   /api/ops/brand-identity/findings/resolve
 *   { siteId, findingsSubstrateId, findingId, status, response? }
 *   → { resolved: true }
 *
 * DELETE /api/ops/brand-identity/findings/resolve
 *   { siteId, findingId }
 *   → { cleared: true }  (reopens the finding)
 *
 * Operator-authed. Tier 4 v1 of the Phase 3 review surface.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  upsertFindingResolution,
  clearFindingResolution,
  type FindingResolutionStatus,
} from "@/lib/brand-identity/readiness-finding-resolutions";

const STATUS_VALUES: FindingResolutionStatus[] = ["resolved", "waived", "deferred"];

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) ?? {};
  const { siteId, findingsSubstrateId, findingId, status, response } = body;
  if (!siteId || !findingsSubstrateId || !findingId || !status) {
    return NextResponse.json(
      { error: "siteId, findingsSubstrateId, findingId, status required" },
      { status: 400 },
    );
  }
  if (!STATUS_VALUES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${STATUS_VALUES.join(", ")}` },
      { status: 400 },
    );
  }
  const result = await upsertFindingResolution({
    businessId: siteId,
    findingsSubstrateId,
    findingId,
    status,
    response: typeof response === "string" ? response : null,
  });
  return NextResponse.json({ resolved: true, id: result.id, created: result.created });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) ?? {};
  const { siteId, findingId } = body;
  if (!siteId || !findingId) {
    return NextResponse.json({ error: "siteId, findingId required" }, { status: 400 });
  }
  const result = await clearFindingResolution({ businessId: siteId, findingId });
  return NextResponse.json(result);
}
