/**
 * Removes the noindex flag from the 'Why Social Matters' series.
 * Run when content is finalized and you want search engines to index.
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
      SET metadata = metadata - 'noindex',
          updated_at = NOW()
      WHERE site_id = ${tp.id} AND slug = ${slug}
      RETURNING title
    `;
    if (result.length > 0) { count++; console.log(`INDEXED: ${result[0].title}`); }
  }
  console.log(`\nDone. ${count}/${SLUGS.length} cleared. Indexing will resume on next crawl.`);
})().catch(err => { console.error(err); process.exit(1); });
