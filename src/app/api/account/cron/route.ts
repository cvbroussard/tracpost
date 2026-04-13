import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * POST /api/account/cron — Daily lifecycle cron.
 *
 * 1. Suspend subscribers past 30-day grace period (is_active → false)
 * 2. Purge data for subscribers past 120 days (hard delete)
 * 3. Clean up expired departure redirects
 * 4. Clean up expired export downloads
 */
export async function POST() {
  const results = {
    suspended: 0,
    purged: 0,
    redirects_cleaned: 0,
    exports_cleaned: 0,
  };

  // 1. Suspend: cancelled_at > 30 days ago AND still active
  const toSuspend = await sql`
    SELECT id FROM subscriptions
    WHERE cancelled_at IS NOT NULL
      AND cancelled_at < NOW() - INTERVAL '30 days'
      AND is_active = true
  `;

  for (const sub of toSuspend) {
    await sql`
      UPDATE subscriptions SET is_active = false, updated_at = NOW()
      WHERE id = ${sub.id}
    `;
    // Disable all sites
    await sql`
      UPDATE sites SET autopilot_enabled = false
      WHERE subscription_id = ${sub.id}
    `;
    results.suspended++;
  }

  // 2. Hard delete: cancelled_at > 120 days ago AND inactive
  const toPurge = await sql`
    SELECT id FROM subscriptions
    WHERE cancelled_at IS NOT NULL
      AND cancelled_at < NOW() - INTERVAL '120 days'
      AND is_active = false
  `;

  for (const sub of toPurge) {
    // CASCADE will handle sites, blog_posts, social_posts, etc.
    await sql`DELETE FROM subscriptions WHERE id = ${sub.id}`;
    results.purged++;
    // Note: R2 assets should be purged separately via a cleanup job
    // that lists objects by sites/{siteId}/ prefix. The site IDs are
    // gone after CASCADE, so we'd need to log them before deletion
    // or use a pre-delete hook. For now, R2 objects become orphaned
    // and can be cleaned via a separate sweep.
  }

  // 3. Clean up expired departure redirects
  const expiredRedirects = await sql`
    DELETE FROM departure_redirects
    WHERE active_until < NOW()
    RETURNING id
  `;
  results.redirects_cleaned = expiredRedirects.length;

  // 4. Clean up expired export downloads
  const expiredExports = await sql`
    DELETE FROM data_exports
    WHERE expires_at < NOW()
    RETURNING id
  `;
  results.exports_cleaned = expiredExports.length;

  return NextResponse.json(results);
}
