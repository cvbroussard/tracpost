/**
 * Publish all 5 'Why Social Matters' articles in noindex mode.
 *
 * Sets status='published' + metadata.noindex=true so the dropdown becomes
 * active and the operator can preview rendered output, but search engines
 * are told not to index. Remove noindex once content is finalized.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const SLUGS = [
  "humans-are-not-lone-wolves-business-has-always-been-social",
  "how-social-networks-were-actually-built-the-trojan-horse-of-free",
  "the-reach-hierarchy-how-many-people-actually-see-each-platform",
  "where-your-customers-actually-live-platform-fit-by-industry",
  "you-used-to-pick-one-the-new-math-says-all-of-them",
];

(async () => {
  const [tp] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  if (!tp) { console.error("TracPost site not found"); process.exit(1); }

  let count = 0;
  for (const slug of SLUGS) {
    const result = await sql`
      UPDATE blog_posts
      SET status = 'published',
          published_at = COALESCE(published_at, NOW()),
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"noindex": true}'::jsonb,
          updated_at = NOW()
      WHERE site_id = ${tp.id} AND slug = ${slug}
      RETURNING title
    `;
    if (result.length > 0) {
      console.log(`PUBLISHED (noindex): ${result[0].title}`);
      count++;
    } else {
      console.log(`SKIP (not found): ${slug}`);
    }
  }
  console.log(`\nDone. ${count}/${SLUGS.length} published with noindex.`);
  console.log("Visit /blog/<slug> to preview. Run scripts/clear-noindex-why-social.js when ready to index.");
})().catch(err => { console.error(err); process.exit(1); });
