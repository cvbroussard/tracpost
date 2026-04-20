import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET  /api/google/profile?site_id=xxx — fetch GBP profile data
 * POST /api/google/profile — update profile fields
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Quick dirty check — no profile fetch needed
  if (params.get("check_dirty")) {
    const { sql } = await import("@/lib/db");
    const [site] = await sql`SELECT gbp_sync_dirty FROM sites WHERE id = ${siteId}`;
    return NextResponse.json({ dirty: site?.gbp_sync_dirty || false });
  }

  const { fetchProfile, syncProfileFromGoogle } = await import("@/lib/gbp/profile");

  // Try cache first
  let profile = await fetchProfile(siteId);

  // If cache miss, try direct sync with error details
  if (!profile) {
    try {
      profile = await syncProfileFromGoogle(siteId);
    } catch (err) {
      return NextResponse.json({
        error: "GBP profile sync failed",
        detail: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }

  if (!profile) {
    // Check if there's even a GBP account linked
    const { sql } = await import("@/lib/db");
    const gbpCheck = await sql`
      SELECT sa.id, sa.status, sa.account_id, sa.metadata->>'account_id' AS meta_acct
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp'
      LIMIT 1
    `;
    return NextResponse.json({
      error: "No active GBP connection",
      debug: {
        gbpAccountFound: gbpCheck.length > 0,
        status: gbpCheck[0]?.status || null,
        accountId: gbpCheck[0]?.account_id || null,
        metaAccountId: gbpCheck[0]?.meta_acct || null,
      },
    }, { status: 404 });
  }

  // Enrich with branding assets from sites table
  const { sql: dbSql } = await import("@/lib/db");
  const [siteAssets] = await dbSql`
    SELECT business_logo, gbp_cover_asset_id FROM sites WHERE id = ${siteId}
  `;
  let enrichedCoverUrl: string | null = null;
  if (siteAssets?.gbp_cover_asset_id) {
    const [coverAsset] = await dbSql`SELECT storage_url FROM media_assets WHERE id = ${siteAssets.gbp_cover_asset_id}`;
    enrichedCoverUrl = (coverAsset?.storage_url as string) || null;
  }

  // Get TracPost categories (source of truth)
  const tpCategories = await dbSql`
    SELECT sgc.gcid, sgc.is_primary, gc.name
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId}
    ORDER BY sgc.is_primary DESC, gc.name
  `;
  const primaryCat = tpCategories.find((c) => c.is_primary);
  const additionalCats = tpCategories.filter((c) => !c.is_primary);

  return NextResponse.json({
    ...profile,
    logoUrl: siteAssets?.business_logo || null,
    coverPhotoUrl: enrichedCoverUrl || (profile as unknown as Record<string, unknown>).coverPhotoUrl || null,
    categories: {
      primary: primaryCat?.name || profile.categories?.primary || "",
      additional: additionalCats.length > 0
        ? additionalCats.map((c) => c.name as string)
        : profile.categories?.additional || [],
    },
  });
}

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const { site_id, action, ...updates } = body;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Push all changes to Google
  if (action === "push") {
    const { pushProfileToGoogle } = await import("@/lib/gbp/profile");
    const result = await pushProfileToGoogle(site_id);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  }

  // Manual refresh from Google (kept for admin use)
  if (action === "sync") {
    const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
    const profile = await syncProfileFromGoogle(site_id);
    return profile
      ? NextResponse.json(profile)
      : NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  // Cover/logo asset reference updates
  if (updates.gbp_cover_asset_id !== undefined || updates.gbp_logo_asset_id !== undefined) {
    const { sql } = await import("@/lib/db");
    if (updates.gbp_cover_asset_id !== undefined) {
      await sql`UPDATE sites SET gbp_cover_asset_id = ${updates.gbp_cover_asset_id} WHERE id = ${site_id}`;

      // Also store the URL in the cached profile for the hero banner
      const [asset] = await sql`SELECT storage_url FROM media_assets WHERE id = ${updates.gbp_cover_asset_id}`;
      if (asset) {
        await sql`
          UPDATE sites SET gbp_profile = jsonb_set(COALESCE(gbp_profile, '{}'::jsonb), '{coverPhotoUrl}', ${JSON.stringify(asset.storage_url)}::jsonb)
          WHERE id = ${site_id}
        `;
      }
    }
    if (updates.gbp_logo_asset_id !== undefined) {
      await sql`UPDATE sites SET gbp_logo_asset_id = ${updates.gbp_logo_asset_id} WHERE id = ${site_id}`;

      const [asset] = await sql`SELECT storage_url FROM media_assets WHERE id = ${updates.gbp_logo_asset_id}`;
      if (asset) {
        await sql`
          UPDATE sites SET gbp_profile = jsonb_set(COALESCE(gbp_profile, '{}'::jsonb), '{logoUrl}', ${JSON.stringify(asset.storage_url)}::jsonb)
          WHERE id = ${site_id}
        `;
      }
    }
    return NextResponse.json({ success: true });
  }

  const { updateProfile } = await import("@/lib/gbp/profile");
  const result = await updateProfile(site_id, updates);

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
