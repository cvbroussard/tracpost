/**
 * One-time backfill: mark all engagement_events older than 30 days as 'archived'.
 *
 * Run after a subscriber's first capture to clear historical comments/reviews
 * out of the inbox. Going forward, the insert path auto-archives old events.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);

  const before = await sql`
    SELECT COUNT(*)::int AS n
    FROM engagement_events
    WHERE review_status = 'new'
      AND occurred_at < NOW() - INTERVAL '30 days'
  `;
  console.log(`Events to archive: ${before[0].n}`);

  if (before[0].n === 0) {
    console.log("Nothing to do.");
    return;
  }

  const updated = await sql`
    UPDATE engagement_events
    SET review_status = 'archived'
    WHERE review_status = 'new'
      AND occurred_at < NOW() - INTERVAL '30 days'
    RETURNING id
  `;
  console.log(`Archived ${updated.length} events.`);
})().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
