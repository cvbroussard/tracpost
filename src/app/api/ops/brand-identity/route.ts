import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  ensureBrandIdentity,
  getBrandIdentity,
  setDeclared,
} from "@/lib/brand-identity/store";

/**
 * Ops brand-identity interview API. Operator-authed (tp_session). Thin wrapper
 * over the scope-parameterized store lib — no business logic here.
 *
 * GET  ?site_id=  → ensure a primary brand_identity exists, then load it
 *                   (identity + descriptors + bound assets, merged with catalog spec)
 * POST { siteId, key, declared } → set a descriptor's declared text
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }
  await ensureBrandIdentity(siteId);
  const data = await getBrandIdentity(siteId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, key, declared, provenance } = await req.json();
  if (!siteId || !key) {
    return NextResponse.json({ error: "siteId and key required" }, { status: 400 });
  }
  const normalized =
    declared === undefined
      ? null
      : typeof declared === "string" || (typeof declared === "object" && declared !== null)
        ? declared
        : null;
  // Provenance: optional per-input slot annotations marking which content was
  // AI-suggested vs owner-typed. Stored in metadata.provenance.
  const provenanceObj =
    provenance && typeof provenance === "object" && !Array.isArray(provenance)
      ? (provenance as Record<string, unknown>)
      : undefined;
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  await setDeclared(brandIdentityId, key, normalized, provenanceObj);
  return NextResponse.json({ ok: true });
}
