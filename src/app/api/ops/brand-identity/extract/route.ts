import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { ensureBrandIdentity } from "@/lib/brand-identity/store";
import { runExtraction, stubExtractor, type ExtractorChooser } from "@/lib/brand-identity/extract";
import { aestheticObservationExtractor } from "@/lib/brand-identity/aesthetic-observation";

/**
 * POST /api/ops/brand-identity/extract  { siteId, key? }
 *
 * Trigger extraction for a brand (or a single descriptor when `key` is given).
 * Operator-authed. Per-descriptor Layer-2 extractors are selected here via
 * `chooseExtractor`; descriptors without a wired extractor fall through to the
 * stub. `aesthetic` runs the [[brand-identity-research-architecture]] Phase 2
 * observation against Sonnet 4.6 multimodal — significantly slower than the
 * stub. When more slow extractors land, move to waitUntil + status polling
 * (the per-descriptor `status` flips already support it).
 */
const chooseExtractor: ExtractorChooser = (spec) => {
  if (spec.key === "aesthetic") return aestheticObservationExtractor;
  return stubExtractor;
};

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
    chooseExtractor,
  });
  return NextResponse.json(result);
}
