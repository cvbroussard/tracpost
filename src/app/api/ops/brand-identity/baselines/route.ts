import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  ensureBrandIdentity,
  setBaselinesApplied,
} from "@/lib/brand-identity/store";

/**
 * POST /api/ops/brand-identity/baselines  { siteId, key, applied: string[] }
 *
 * Persist the baselines being APPLIED for a descriptor — the baseline ids
 * that are CHECKED. Inclusion semantics: the list is what's actively applied.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, key, applied } = await req.json();
  if (!siteId || !key || !Array.isArray(applied)) {
    return NextResponse.json(
      { error: "siteId, key, applied[] required" },
      { status: 400 },
    );
  }
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  await setBaselinesApplied(
    brandIdentityId,
    key,
    applied.filter((x: unknown): x is string => typeof x === "string"),
  );
  return NextResponse.json({ ok: true });
}
