/**
 * Migration 059: notifications table.
 *
 * Cross-feature notification persistence. Operator-sent help nudges
 * (Phase 6 onboarding queue), GBP location-pending alerts, future
 * billing/quality/AUP notifications all land here.
 *
 * Surfaces:
 *   - Studio bell (post-onboarding, via existing useNotifications hook)
 *   - Onboarding wizard (pre-studio, via /api/onboarding/[token]/nudges)
 *   - /api/manage/alerts ribbon (admin)
 *
 * Categories: 'onboarding', 'campaigns', 'billing', 'quality', 'aup',
 *             'disputes', 'connections', 'general'
 *
 * Lifecycle:
 *   created_at → read_at (subscriber opened the bell / banner)
 *               → dismissed_at (subscriber explicitly closed it)
 *   Active = dismissed_at IS NULL
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("059: notifications...");

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      category          TEXT NOT NULL,
      severity          TEXT NOT NULL DEFAULT 'info',
      title             TEXT NOT NULL,
      body              TEXT NOT NULL,
      metadata          JSONB NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at           TIMESTAMPTZ,
      dismissed_at      TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_subscription
      ON notifications(subscription_id, created_at DESC)
      WHERE dismissed_at IS NULL
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_category
      ON notifications(category, created_at DESC)
      WHERE dismissed_at IS NULL
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON notifications(subscription_id)
      WHERE read_at IS NULL AND dismissed_at IS NULL
  `;

  console.log("059: done");
})();
