/**
 * Migration 061: wipe_log table.
 *
 * Audit trail of subscription wipes (test cleanup + compliance erasure).
 * Lives outside the cascade — survives the deletion of the row it
 * references. Records the operator action, reason, Stripe linkage at
 * wipe-time, and what was/wasn't successfully removed.
 *
 * For test cleanup: provides traceability of when synthetic accounts
 * were removed during pilot/QA cycles.
 *
 * For compliance erasure: legally required documentation of GDPR/CCPA
 * right-to-delete fulfillment. Notes field carries the request reference
 * (legal hold ID, request date, exemption rationale, etc.).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("061: wipe_log table...");

  await sql`
    CREATE TABLE IF NOT EXISTS wipe_log (
      id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id                 UUID NOT NULL,
      reason                          TEXT NOT NULL CHECK (reason IN ('test_cleanup', 'compliance_erasure')),
      operator_id                     TEXT,
      notes                           TEXT,
      stripe_subscription_id          TEXT,
      stripe_customer_id              TEXT,
      stripe_subscription_cancelled   BOOLEAN NOT NULL DEFAULT false,
      stripe_customer_deleted         BOOLEAN NOT NULL DEFAULT false,
      wiped_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wipe_log_subscription
      ON wipe_log(subscription_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_wipe_log_reason
      ON wipe_log(reason, wiped_at DESC)
  `;

  console.log("061: done");
})();
