import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { sendArchiveNoticeEmail } from "@/lib/lifecycle-emails";

/**
 * POST /api/account/cron — Daily lifecycle cron.
 *
 * 1. Archive subscribers past 30-day cancellation grace
 *    (status → 'archived', cancellation grace expired)
 * 2. Clean up expired departure redirects
 * 3. Clean up expired export downloads
 *
 * NO automated hard delete. Archive is the terminus of the lifecycle.
 * Hard deletion is operator-only via /admin/compliance/erasure (legal
 * erasure requests) or /admin/test-subscriptions (synthetic test cleanup).
 */
export async function POST() {
  const results = {
    archived: 0,
    redirects_cleaned: 0,
    exports_cleaned: 0,
  };

  // 1. Archive: cancellation grace expired (>30 days), status still 'active'
  const toArchive = await sql`
    SELECT id FROM subscriptions
    WHERE cancelled_at IS NOT NULL
      AND cancelled_at < NOW() - INTERVAL '30 days'
      AND status = 'active'
  `;

  for (const sub of toArchive) {
    await sql`
      UPDATE subscriptions
      SET status = 'archived',
          archived_at = NOW(),
          archived_by = 'auto_grace_expiry',
          archive_reason = COALESCE(cancel_reason, 'cancellation grace expired'),
          is_active = false,
          updated_at = NOW()
      WHERE id = ${sub.id}
    `;
    // Disable autopilot on all sites — archive means no further automation
    await sql`
      UPDATE sites SET autopilot_enabled = false
      WHERE subscription_id = ${sub.id}
    `;

    // Notify the owner
    const [owner] = await sql`
      SELECT email, name FROM users
      WHERE subscription_id = ${sub.id} AND role = 'owner'
      LIMIT 1
    `;
    if (owner?.email) {
      try {
        await sendArchiveNoticeEmail({
          to: owner.email as string,
          ownerName: (owner.name as string) || undefined,
        });
      } catch (err) {
        console.error("Archive notice email failed (non-fatal):", err);
      }
    }

    results.archived++;
  }

  // 2. Clean up expired departure redirects
  const expiredRedirects = await sql`
    DELETE FROM departure_redirects
    WHERE active_until < NOW()
    RETURNING id
  `;
  results.redirects_cleaned = expiredRedirects.length;

  // 3. Clean up expired export downloads
  const expiredExports = await sql`
    DELETE FROM data_exports
    WHERE expires_at < NOW()
    RETURNING id
  `;
  results.exports_cleaned = expiredExports.length;

  // 5. Nightly GBP sync — push dirty profiles + categories to Google
  let gbpPushed = 0;
  let gbpFailed = 0;
  try {
    const { syncDirtySites } = await import("@/lib/gbp/profile");
    const gbpResult = await syncDirtySites();
    gbpPushed = gbpResult.pushed;
    gbpFailed = gbpResult.failed;
  } catch (err) {
    console.error("GBP nightly sync error:", err);
  }

  return NextResponse.json({ ...results, gbp_pushed: gbpPushed, gbp_failed: gbpFailed });
}
