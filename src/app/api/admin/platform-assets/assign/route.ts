import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { assignSiteToAsset, unassignSiteFromAsset } from "@/lib/platform-assets";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { site_id, platform_asset_id, is_primary } = body;

  if (!site_id || !platform_asset_id) {
    return NextResponse.json({ error: "site_id and platform_asset_id required" }, { status: 400 });
  }

  // If marking primary, unset other primaries for the same site+platform first
  if (is_primary) {
    const [asset] = await sql`SELECT platform FROM platform_assets WHERE id = ${platform_asset_id}`;
    if (asset) {
      await sql`
        UPDATE site_platform_assets
        SET is_primary = false
        WHERE site_id = ${site_id}
          AND platform_asset_id IN (
            SELECT id FROM platform_assets WHERE platform = ${asset.platform}
          )
      `;
    }
  }

  await assignSiteToAsset({ siteId: site_id, platformAssetId: platform_asset_id, isPrimary: is_primary });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { site_id, platform_asset_id } = body;

  if (!site_id || !platform_asset_id) {
    return NextResponse.json({ error: "site_id and platform_asset_id required" }, { status: 400 });
  }

  await unassignSiteFromAsset(site_id, platform_asset_id);
  return NextResponse.json({ success: true });
}
