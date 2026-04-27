/**
 * Backfill series metadata onto the "Why Social Matters" articles.
 * Idempotent — re-runs are safe.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const SERIES_NAME = "Why Social Matters";
const SERIES_SLUG = "why-social-matters";

const ORDER = [
  "humans-are-not-lone-wolves-business-has-always-been-social",
  "how-social-networks-were-actually-built-the-trojan-horse-of-free",
  "the-reach-hierarchy-how-many-people-actually-see-each-platform",
  "where-your-customers-actually-live-platform-fit-by-industry",
  "you-used-to-pick-one-the-new-math-says-all-of-them",
];

(async () => {
  const [tp] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  if (!tp) { console.error("TracPost site not found"); process.exit(1); }

  let updated = 0;
  for (let i = 0; i < ORDER.length; i++) {
    const series = {
      slug: SERIES_SLUG,
      name: SERIES_NAME,
      index: i + 1,
      total: ORDER.length,
    };
    const result = await sql`
      UPDATE blog_posts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ series })}::jsonb,
          updated_at = NOW()
      WHERE site_id = ${tp.id} AND slug = ${ORDER[i]}
      RETURNING id
    `;
    if (result.length > 0) {
      console.log(`  [${i + 1}/${ORDER.length}] ${ORDER[i]}`);
      updated++;
    } else {
      console.log(`  SKIP (not found): ${ORDER[i]}`);
    }
  }
  console.log(`\nDone. Updated ${updated}/${ORDER.length}.`);
})().catch(err => { console.error(err); process.exit(1); });
