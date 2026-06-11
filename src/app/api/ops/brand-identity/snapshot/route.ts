/**
 * GET  /api/ops/brand-identity/snapshot?siteId=<uuid>
 *   Returns the latest brand_identity_snapshot substrate + recent history.
 *   { latest: { id, runNumber, payload, generatedAt } | null,
 *     history: [{ id, runNumber, generatedAt, descriptorCount }, ...] }
 *
 * POST /api/ops/brand-identity/snapshot { siteId }
 *   Seals the current brand_descriptor state into a new immutable snapshot
 *   row. Returns { persisted, substrateId, runNumber, descriptorCount }
 *   on success; { persisted: false, reason } on precondition failure.
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  sealBrandIdentitySnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
} from "@/lib/brand-identity/snapshot";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const [latest, history] = await Promise.all([
    getLatestSnapshot(siteId),
    getSnapshotHistory(siteId),
  ]);
  return NextResponse.json({ latest, history });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = (await req.json()) ?? {};
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const result = await sealBrandIdentitySnapshot({ businessId: siteId });
  return NextResponse.json(result);
}
