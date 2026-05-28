/**
 * Blog import orchestrator — ties discovery, extraction, image re-hosting,
 * and database insertion together into an async import job.
 */
import { sql } from "@/lib/db";
import { discoverBlogPosts, type DiscoveredPost } from "./discover";
import { extractPostContent } from "./extract";
import { rehostImages, rewriteImageUrls } from "./images";

/**
 * Run the full import for a blog_imports job.
 * Called after discovery — processes each discovered URL.
 */
export async function runBlogImport(importId: string): Promise<void> {
  // Load the import job
  const [job] = await sql`
    SELECT id, business_id, source_url, discovered_urls, status
    FROM blog_imports WHERE id = ${importId}
  `;
  if (!job) throw new Error(`Import job ${importId} not found`);

  const siteId = job.site_id as string;
  const discoveredUrls = job.discovered_urls as DiscoveredPost[];
  const errors: Array<{ url: string; error: string }> = [];
  let importedCount = 0;

  // Update status to importing
  await sql`
    UPDATE blog_imports
    SET status = 'importing', updated_at = NOW()
    WHERE id = ${importId}
  `;

  for (const post of discoveredUrls) {
    try {
      // Update current post for progress display
      await sql`
        UPDATE blog_imports
        SET current_post = ${post.slug}, updated_at = NOW()
        WHERE id = ${importId}
      `;

      // Rate limit: 1 req/s
      await sleep(1000);

      // Extract content via Claude
      const extracted = await extractPostContent(post.url);

      // Re-host images to R2
      const urlMap = await rehostImages(extracted.imageUrls, siteId);
      const body = rewriteImageUrls(extracted.body, urlMap);

      // Use featured image from extraction, re-hosted if available
      let ogImageUrl = extracted.featuredImageUrl;
      if (ogImageUrl && urlMap.has(ogImageUrl)) {
        ogImageUrl = urlMap.get(ogImageUrl)!;
      }

      // Determine slug — use original, but avoid overwriting generated posts
      let slug = post.slug;
      const [existing] = await sql`
        SELECT id, source FROM blog_posts
        WHERE business_id = ${siteId} AND slug = ${slug}
      `;
      if (existing && existing.source === "generated") {
        slug = `${slug}-imported`;
      }

      // Build Article schema.org JSON-LD
      const schemaJson = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: extracted.title,
        description: extracted.metaDescription,
        ...(ogImageUrl && { image: ogImageUrl }),
        ...(extracted.publishDate && {
          datePublished: extracted.publishDate,
        }),
      };

      // Upsert into blog_posts
      await sql`
        INSERT INTO blog_posts (
          business_id, slug, title, body, excerpt, meta_title,
          meta_description, og_image_url, schema_json, tags,
          status, published_at, source
        ) VALUES (
          ${siteId}, ${slug}, ${extracted.title}, ${body},
          ${extracted.excerpt}, ${extracted.title},
          ${extracted.metaDescription}, ${ogImageUrl},
          ${JSON.stringify(schemaJson)}, ${extracted.tags},
          'published',
          ${extracted.publishDate || new Date().toISOString()},
          'imported'
        )
        ON CONFLICT (business_id, slug) DO UPDATE SET
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          excerpt = EXCLUDED.excerpt,
          meta_title = EXCLUDED.meta_title,
          meta_description = EXCLUDED.meta_description,
          og_image_url = EXCLUDED.og_image_url,
          schema_json = EXCLUDED.schema_json,
          tags = EXCLUDED.tags,
          updated_at = NOW()
      `;

      importedCount++;

      // Update progress
      await sql`
        UPDATE blog_imports
        SET imported_count = ${importedCount}, updated_at = NOW()
        WHERE id = ${importId}
      `;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push({ url: post.url, error: msg });
    }
  }

  // Mark complete
  const finalStatus = errors.length === discoveredUrls.length ? "failed" : "completed";
  await sql`
    UPDATE blog_imports
    SET status = ${finalStatus},
        imported_count = ${importedCount},
        errors = ${JSON.stringify(errors)},
        current_post = NULL,
        updated_at = NOW()
    WHERE id = ${importId}
  `;
}

/**
 * Start the discovery phase for a new import.
 * Creates the blog_imports row and discovers posts.
 */
export async function startDiscovery(
  siteId: string,
  blogUrl: string
): Promise<{ importId: string; posts: DiscoveredPost[] }> {
  // Create the import job
  const [row] = await sql`
    INSERT INTO blog_imports (business_id, source_url, status)
    VALUES (${siteId}, ${blogUrl}, 'discovering')
    RETURNING id
  `;
  const importId = row.id as string;

  try {
    const posts = await discoverBlogPosts(blogUrl);

    // Store discovered posts
    await sql`
      UPDATE blog_imports
      SET discovered_urls = ${JSON.stringify(posts)},
          total_count = ${posts.length},
          status = 'pending',
          updated_at = NOW()
      WHERE id = ${importId}
    `;

    return { importId, posts };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Discovery failed";
    await sql`
      UPDATE blog_imports
      SET status = 'failed',
          errors = ${JSON.stringify([{ url: blogUrl, error: msg }])},
          updated_at = NOW()
      WHERE id = ${importId}
    `;
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { generateRedirectInstructions } from "./redirects";
export type { DiscoveredPost } from "./discover";
export type { RedirectInstructions, PlatformRedirect } from "./redirects";
