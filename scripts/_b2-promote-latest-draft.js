const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}

/**
 * Promote B2's latest home-page draft to published. Mirrors the
 * /api/admin/businesses/[id]/website/promote-draft endpoint with the
 * promoteLatestDraft() server action: atomic archive-then-publish.
 *
 * Use when the deployed UI is stale or you want to verify the live
 * site without waiting for a redeploy. ISR cache on Vercel will still
 * take up to revalidate=3600s to expire unless the API route fires.
 */
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id, name FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1
    `)).rows;
    if (!biz) return console.log("No B2.");
    console.log(`B2: ${biz.name} (${biz.id})`);

    const [latest] = (await c.query(`
      SELECT id, generated_at FROM website_content
      WHERE business_id = $1 AND page_key = 'home' AND status = 'draft'
      ORDER BY generated_at DESC LIMIT 1
    `, [biz.id])).rows;
    if (!latest) {
      console.log("No draft to promote — run Phase 1 generator first.");
      return;
    }
    console.log(`Latest draft: ${latest.id} (generated ${latest.generated_at.toISOString()})`);

    const [existingPub] = (await c.query(`
      SELECT id FROM website_content
      WHERE business_id = $1 AND page_key = 'home' AND status = 'published' LIMIT 1
    `, [biz.id])).rows;
    if (existingPub) {
      console.log(`Existing published: ${existingPub.id} — will be archived`);
    }

    await c.query("BEGIN");
    await c.query(`
      UPDATE website_content
      SET status = 'archived', updated_at = NOW()
      WHERE business_id = $1 AND page_key = 'home' AND status = 'published'
    `, [biz.id]);
    await c.query(`
      UPDATE website_content
      SET status = 'published', updated_at = NOW()
      WHERE id = $1
    `, [latest.id]);
    await c.query("COMMIT");

    console.log(`\nPromoted ${latest.id} to published.`);
    console.log("Vercel ISR cache may still hold the old render for up to 1h —");
    console.log("redeploy or wait for revalidate=3600 to expire to see the change live.");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
})();
