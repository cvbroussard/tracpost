import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import {
  ensureBrandIdentity,
  bindAsset,
  unbindAsset,
} from "@/lib/brand-identity/store";

/**
 * Ops brand-identity asset binding. Operator-authed (tp_session).
 *
 * GET    ?site_id=  → the site's (non-archived) assets, for the picker
 * POST   { siteId, key, assetId, role?, position? } → bind asset to a descriptor
 * DELETE { siteId, key, assetId }                   → unbind
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }
  const assets = await sql`
    SELECT id, storage_url, media_type, context_note
    FROM media_assets
    WHERE business_id = ${siteId} AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, key, assetId, role, position } = await req.json();
  if (!siteId || !key || !assetId) {
    return NextResponse.json(
      { error: "siteId, key, assetId required" },
      { status: 400 },
    );
  }
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  await bindAsset(brandIdentityId, key, assetId, {
    role: typeof role === "string" ? role : null,
    position: typeof position === "number" ? position : 0,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId, key, assetId } = await req.json();
  if (!siteId || !key || !assetId) {
    return NextResponse.json(
      { error: "siteId, key, assetId required" },
      { status: 400 },
    );
  }
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  await unbindAsset(brandIdentityId, key, assetId);
  return NextResponse.json({ ok: true });
}
