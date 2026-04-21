import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/sites/[siteId]/photos
 * Actions: sync (auto-push eligible assets), pull (fetch existing GBP photos), delete
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const [site] = await sql`SELECT id FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (action === "sync") {
    const { autoSyncPhotos } = await import("@/lib/gbp/photos");
    const result = await autoSyncPhotos(siteId);
    return NextResponse.json({ success: true, ...result });
  }

  if (action === "sync_selected") {
    const { asset_ids } = body;
    if (!asset_ids?.length) {
      return NextResponse.json({ error: "asset_ids required" }, { status: 400 });
    }

    const { uploadGbpPhoto, mapToGbpCategory } = await import("@/lib/gbp/photos");
    const { decrypt } = await import("@/lib/crypto");

    const [gbpAccount] = await sql`
      SELECT sa.account_id, sa.access_token_encrypted, sa.metadata
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
      LIMIT 1
    `;

    if (!gbpAccount) {
      return NextResponse.json({ error: "No active GBP account" }, { status: 400 });
    }

    const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
    const metadata = gbpAccount.metadata as Record<string, unknown>;
    const gbpAccountId = (metadata?.account_id as string) || "";
    const locationPath = gbpAccountId && gbpAccount.account_id
      ? `${gbpAccountId}/${gbpAccount.account_id}`
      : gbpAccount.account_id;

    const assets = await sql`
      SELECT id, storage_url, content_pillar, ai_analysis
      FROM media_assets WHERE id = ANY(${asset_ids})
    `;

    let synced = 0;
    for (const asset of assets) {
      const analysis = (asset.ai_analysis || {}) as Record<string, unknown>;
      const sceneType = (analysis.scene_type as string) || null;
      const category = mapToGbpCategory(asset.content_pillar as string, sceneType);
      const description = (analysis.description as string) || undefined;

      const result = await uploadGbpPhoto(
        accessToken,
        locationPath as string,
        asset.storage_url as string,
        category,
        description,
      );

      if (result) {
        await sql`
          INSERT INTO gbp_photo_sync (site_id, media_asset_id, gbp_media_name, gbp_media_url, source_url, category, media_type)
          VALUES (${siteId}, ${asset.id}, ${result.name}, ${result.googleUrl || null}, ${asset.storage_url}, ${category}, 'PHOTO')
          ON CONFLICT DO NOTHING
        `;
        synced++;
      }
    }

    return NextResponse.json({ success: true, synced });
  }

  if (action === "unsync") {
    const { asset_id } = body;
    if (!asset_id) {
      return NextResponse.json({ error: "asset_id required" }, { status: 400 });
    }

    // Get the GBP media name to delete from Google
    const [syncRecord] = await sql`
      SELECT gbp_media_name FROM gbp_photo_sync
      WHERE site_id = ${siteId} AND media_asset_id = ${asset_id}
    `;

    if (syncRecord?.gbp_media_name) {
      try {
        const { deleteGbpPhoto } = await import("@/lib/gbp/photos");
        const { decrypt } = await import("@/lib/crypto");

        const [gbpAccount] = await sql`
          SELECT sa.access_token_encrypted
          FROM social_accounts sa
          JOIN site_social_links ssl ON ssl.social_account_id = sa.id
          WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
          LIMIT 1
        `;

        if (gbpAccount) {
          const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
          await deleteGbpPhoto(accessToken, syncRecord.gbp_media_name as string);
        }
      } catch (err) {
        console.error("GBP photo delete failed:", err);
      }
    }

    // Remove sync record regardless
    await sql`DELETE FROM gbp_photo_sync WHERE site_id = ${siteId} AND media_asset_id = ${asset_id}`;

    return NextResponse.json({ success: true });
  }

  if (action === "pull") {
    const { pullGbpPhotos } = await import("@/lib/gbp/photos");
    const added = await pullGbpPhotos(siteId);
    return NextResponse.json({ success: true, added });
  }

  if (action === "delete") {
    const { gbpMediaName } = body;
    if (!gbpMediaName) {
      return NextResponse.json({ error: "gbpMediaName required" }, { status: 400 });
    }

    const { deleteGbpPhoto } = await import("@/lib/gbp/photos");
    const { decrypt } = await import("@/lib/crypto");

    const [gbpAccount] = await sql`
      SELECT sa.access_token_encrypted
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
      LIMIT 1
    `;

    if (!gbpAccount) {
      return NextResponse.json({ error: "No active GBP account" }, { status: 400 });
    }

    const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
    const deleted = await deleteGbpPhoto(accessToken, gbpMediaName);

    if (deleted) {
      await sql`DELETE FROM gbp_photo_sync WHERE gbp_media_name = ${gbpMediaName} AND site_id = ${siteId}`;
    }

    return NextResponse.json({ success: deleted });
  }

  if (action === "set_cover" || action === "set_logo") {
    const { sourceUrl } = body;
    if (!sourceUrl) {
      return NextResponse.json({ error: "sourceUrl required" }, { status: 400 });
    }

    const { setGbpCoverOrLogo } = await import("@/lib/gbp/photos");
    const { decrypt } = await import("@/lib/crypto");

    const [gbpAccount] = await sql`
      SELECT sa.account_id, sa.access_token_encrypted, sa.metadata
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
      LIMIT 1
    `;

    if (!gbpAccount) {
      return NextResponse.json({ error: "No active GBP account" }, { status: 400 });
    }

    const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
    const metadata = gbpAccount.metadata as Record<string, unknown>;
    const gbpAccountId = (metadata?.account_id as string) || "";
    const locationPath = gbpAccountId && gbpAccount.account_id
      ? `${gbpAccountId}/${gbpAccount.account_id}`
      : gbpAccount.account_id;

    const type = action === "set_cover" ? "COVER" as const : "LOGO" as const;
    const result = await setGbpCoverOrLogo(accessToken, locationPath, sourceUrl, type);

    return NextResponse.json({ success: !!result, ...result });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
