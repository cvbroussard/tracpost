/**
 * Migration 058: onboarding_submissions table.
 *
 * Backs the new white-glove onboarding flow. Each row represents one
 * subscriber's onboarding journey from Stripe checkout completion to
 * operator-confirmed handoff to the studio.
 *
 * Token-based access — the form route is /onboarding/[token] (marketing
 * site). Token is unguessable (~32 random chars) and serves as both
 * authorization and per-step continuity (form state persists between
 * sessions).
 *
 * Lifecycle:
 *   1. Created when subscriber initiates Stripe checkout (token issued)
 *   2. Updated as subscriber progresses through form steps (data + platform_status)
 *   3. submitted_at set when subscriber clicks final Submit
 *   4. completed_at set when operator clicks "Send welcome email"
 *   5. Expires 30 days after creation (configurable)
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("058: onboarding_submissions...");

  await sql`
    CREATE TABLE IF NOT EXISTS onboarding_submissions (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      token              TEXT UNIQUE NOT NULL,
      current_step       INTEGER NOT NULL DEFAULT 1,
      data               JSONB NOT NULL DEFAULT '{}',
      platform_status    JSONB NOT NULL DEFAULT '{}',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at       TIMESTAMPTZ,
      completed_at       TIMESTAMPTZ,
      expires_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
    )
  `;
  console.log("  + onboarding_submissions");

  await sql`CREATE INDEX IF NOT EXISTS idx_onboarding_token ON onboarding_submissions(token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_onboarding_subscription ON onboarding_submissions(subscription_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_onboarding_pending ON onboarding_submissions(submitted_at) WHERE completed_at IS NULL`;
  console.log("  + 3 indexes");

  console.log("Done.");
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
