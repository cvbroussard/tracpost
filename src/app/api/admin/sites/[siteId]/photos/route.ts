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
