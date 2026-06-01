import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { ensureBrandIdentity } from "@/lib/brand-identity/store";
import { runExtraction } from "@/lib/brand-identity/extract";

/**
 * POST /api/ops/brand-identity/extract  { siteId, key? }
 *
 * Trigger extraction for a brand (or a single descriptor when `key` is given).
 * Operator-authed. v1 runs inline with the STUB extractor (instant). When the
 * real per-descriptor LLM/Vision extractor lands (Layer 2, slow), move this to
 * waitUntil + status polling — the per-descriptor `status` flips already support it.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, key } = await req.json();
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  const result = await runExtraction(brandIdentityId, {
    keys: key ? [key] : undefined,
  });
  return NextResponse.json(result);
}
