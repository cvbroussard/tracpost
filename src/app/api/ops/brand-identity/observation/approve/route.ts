/**
 * POST /api/ops/brand-identity/observation/approve
 *   { siteId, descriptorKey, observationSubstrateId }
 *
 * Approve a per-descriptor observed value as that descriptor's canonical
 * declared content. Tier 2 of the Phase 3 review surface. Operator-authed.
 *
 * Returns { committed: true } on success, or { committed: false, reason } on
 * stale-substrate / unknown-descriptor / null-slot.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { ensureBrandIdentity } from "@/lib/brand-identity/store";
import { approveObservationDescriptor } from "@/lib/brand-identity/observation-approve";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { siteId, descriptorKey, observationSubstrateId } = body ?? {};
  if (!siteId || !descriptorKey || !observationSubstrateId) {
    return NextResponse.json(
      { error: "siteId, descriptorKey, observationSubstrateId required" },
      { status: 400 },
    );
  }
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  const result = await approveObservationDescriptor({
    brandIdentityId,
    businessId: siteId,
    descriptorKey,
    expectedSubstrateId: observationSubstrateId,
  });
  return NextResponse.json(result);
}
