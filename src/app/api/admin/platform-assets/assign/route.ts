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

  const [asset] = await sql`SELECT platform FROM platform_assets WHERE id = ${platform_asset_id}`;
  const platform = asset?.platform as string | undefined;

  // If marking primary, unset other primaries for the same site+platform first
  if (is_primary && platform) {
    await sql`
      UPDATE business_platform_assets
      SET is_primary = false
      WHERE business_id = ${site_id}
        AND platform_asset_id IN (
          SELECT id FROM platform_assets WHERE platform = ${platform}
        )
    `;
  }

  await assignSiteToAsset({ siteId: site_id, platformAssetId: platform_asset_id, isPrimary: is_primary });

  // GBP primary assignments need a fresh profile sync so the local cache
  // populates and dirty state lands in the coherent (clean) state. Mirrors
  // the legacy /api/google/link-locations path, non-fatal on failure.
  if (is_primary && platform === "gbp") {
    try {
      const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
      await syncProfileFromGoogle(site_id);
    } catch (err) {
      console.warn("Post-assignment GBP sync failed:", err instanceof Error ? err.message : err);
    }
  }

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
