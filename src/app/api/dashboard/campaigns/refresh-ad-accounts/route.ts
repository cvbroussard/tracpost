import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { discoverAdAccounts } from "@/lib/meta-ads";
import { recordAsset } from "@/lib/platform-assets";

/**
 * POST /api/dashboard/campaigns/refresh-ad-accounts
 *
 * Re-runs ad-account discovery against Meta using the existing Ads
 * OAuth token. Idempotent — UPSERTs any new accounts the user has
 * gained access to since the original OAuth (e.g., created a new ad
 * account in their Business Manager). Returns the count of accounts
 * now stored.
 *
 * No re-OAuth required — the existing token has business_management
 * scope which surfaces all accessible ad accounts at query time.
 */
export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  // Find the meta_ads OAuth grant for this subscription
  const [grant] = await sql`
    SELECT id, access_token_encrypted
    FROM social_accounts
    WHERE subscription_id = ${session.subscriptionId}
      AND platform = 'meta_ads'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!grant) {
    return NextResponse.json({ error: "No Meta Ads OAuth grant found. Authorize first." }, { status: 400 });
  }

  const accessToken = decrypt(grant.access_token_encrypted as string);

  try {
    const accounts = await discoverAdAccounts(accessToken);

    let updatedCount = 0;
    for (const account of accounts) {
      await recordAsset({
        socialAccountId: grant.id as string,
        platform: "meta_ads",
        assetType: "meta_ad_account",
        assetId: account.id,
        assetName: account.name,
        metadata: {
          account_id: account.accountId,
          currency: account.currency,
          status: account.status,
          amount_spent: account.amountSpent,
        },
      });
      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      discovered: accounts.length,
      updated: updatedCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "discovery_failed", message }, { status: 502 });
  }
}
