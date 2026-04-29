/**
 * Migration 060: Subscription lifecycle status + audit columns.
 *
 * Replaces the implicit (is_active + cancelled_at) state model with an
 * explicit status enum-like column plus per-state timestamp/source/reason
 * columns. is_active is retained for backwards compatibility but new code
 * reads `status`.
 *
 * States: active | paused | suspended | archived
 *   - active     — normal operation
 *   - paused     — short-term hold, reversible. paused_by tracks tenant vs platform.
 *   - suspended  — billing-failure or policy enforcement; recoverable on payment.
 *   - archived   — terminal soft delete; thin compliance/audit shell.
 *                  Can transition to active via re-onboarding (operator gate).
 *
 * No hard delete in routine flow. Hard delete only via /admin/compliance/erasure
 * (GDPR/CCPA) or test-subscription wipe console (is_test = true rows).
 *
 * Backfill rules from existing rows:
 *   is_active = true  AND cancelled_at IS NULL  → active
 *   is_active = true  AND cancelled_at SET     → active (cancellation grace, still has access)
 *   is_active = false AND cancelled_at SET     → archived (post-grace inactive)
 *   is_active = false AND cancelled_at IS NULL → suspended (rare edge case)
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("060: subscription lifecycle status + audit columns...");

  // Add status column with CHECK constraint
  await sql`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'suspended', 'archived'))
  `;

  // Pause columns
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ`;
  await sql`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS paused_by TEXT
        CHECK (paused_by IS NULL OR paused_by IN ('tenant', 'platform'))
  `;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pause_reason TEXT`;

  // Suspended columns
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS suspend_reason TEXT`;

  // Archived columns
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await sql`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS archived_by TEXT
        CHECK (archived_by IS NULL OR archived_by IN ('tenant', 'platform', 'auto_grace_expiry'))
  `;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS archive_reason TEXT`;

  // Test subscription flag (Phase 6 of build queue but cheap to add now)
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false`;

  // Backfill status from existing is_active + cancelled_at
  // Active subscribers
  await sql`
    UPDATE subscriptions
    SET status = 'active'
    WHERE is_active = true AND cancelled_at IS NULL
  `;

  // Cancellation-grace (still active, but cancelled_at set) — these stay 'active' until grace expires
  await sql`
    UPDATE subscriptions
    SET status = 'active'
    WHERE is_active = true AND cancelled_at IS NOT NULL
  `;

  // Post-grace inactive → archived
  await sql`
    UPDATE subscriptions
    SET status = 'archived',
        archived_at = COALESCE(cancelled_at + INTERVAL '30 days', updated_at, NOW()),
        archived_by = 'auto_grace_expiry',
        archive_reason = COALESCE(cancel_reason, 'cancellation grace expired')
    WHERE is_active = false AND cancelled_at IS NOT NULL
  `;

  // Inactive without cancellation (rare edge case) → suspended
  await sql`
    UPDATE subscriptions
    SET status = 'suspended',
        suspended_at = COALESCE(updated_at, NOW()),
        suspend_reason = 'pre-migration inactive without cancellation'
    WHERE is_active = false AND cancelled_at IS NULL
  `;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_is_test ON subscriptions(is_test) WHERE is_test = true`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status_active
      ON subscriptions(status)
      WHERE status IN ('active', 'paused')
  `;

  // Verify
  const stats = await sql`
    SELECT status, COUNT(*) AS count
    FROM subscriptions
    GROUP BY status
    ORDER BY status
  `;
  console.log("060: status distribution after migration:");
  for (const row of stats) {
    console.log(`  ${row.status}: ${row.count}`);
  }

  console.log("060: done");
})();
