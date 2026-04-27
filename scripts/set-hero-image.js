const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);
(async () => {
  const slug = process.argv[2];
  const url = process.argv[3];
  if (!slug || !url) {
    console.error("Usage: node scripts/set-hero-image.js <slug> <url>");
    process.exit(1);
  }
  const [tp] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  const result = await sql`
    UPDATE blog_posts SET og_image_url = ${url}, updated_at = NOW()
    WHERE site_id = ${tp.id} AND slug = ${slug}
    RETURNING title
  `;
  console.log(result.length > 0 ? `UPDATED: ${result[0].title} → ${url}` : `NOT FOUND: ${slug}`);
})();
