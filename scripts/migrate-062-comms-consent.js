/**
 * Migration 062: comms_consent table.
 *
 * Append-only audit log of every SMS/email consent change. The legal
 * record that satisfies provider-registration requirements (10DLC A2P)
 * and CASL/GDPR-style audit trails.
 *
 * Each row records:
 *   - WHO (subscription_id, user_id)
 *   - WHAT channel (sms | email)
 *   - WHAT type (transactional | marketing)
 *   - WHICH action (opt_in | opt_out)
 *   - WHERE captured (onboarding_step_6 | settings_page | sms_reply_stop | operator)
 *   - WHAT they agreed to (verbatim consent_text shown to user)
 *   - WHERE FROM (ip_address, user_agent)
 *   - WHEN (created_at)
 *
 * Append-only: never UPDATE or DELETE. Each consent change inserts a new
 * row. The "current state" is computed by reading the latest row per
 * (subscription_id, channel, consent_type).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("062: comms_consent table...");

  await sql`
    CREATE TABLE IF NOT EXISTS comms_consent (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
      channel            TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
      consent_type       TEXT NOT NULL CHECK (consent_type IN ('transactional', 'marketing')),
      action             TEXT NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
      source             TEXT NOT NULL,
      consent_text       TEXT NOT NULL,
      phone_number       TEXT,
      email_address      TEXT,
      ip_address         INET,
      user_agent         TEXT,
      metadata           JSONB DEFAULT '{}'::jsonb,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_comms_consent_subscription
      ON comms_consent(subscription_id, channel, consent_type, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_comms_consent_phone
      ON comms_consent(phone_number)
      WHERE phone_number IS NOT NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_comms_consent_email
      ON comms_consent(email_address)
      WHERE email_address IS NOT NULL
  `;

  console.log("062: done");
})();
