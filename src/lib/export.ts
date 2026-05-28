/**
 * Data export — builds a zip archive of all subscriber content.
 *
 * Contents:
 *   blog-posts/{slug}.md   — markdown with YAML frontmatter
 *   social-posts.csv       — caption history
 *   site-config.json       — brand voice, pillars, cadence, blog settings
 *   seo-audits.json        — latest audit results
 *   url-map.txt            — TracPost URLs for redirect setup
 */
import { sql } from "@/lib/db";
import { uploadBufferToR2 } from "@/lib/r2";
import archiver from "archiver";
import { PassThrough } from "stream";
import { generateRedirectInstructions } from "@/lib/blog-import/redirects";

/**
 * Build and upload an export archive for a subscriber.
 * Returns the R2 download URL.
 */
export async function buildExportArchive(
  subscriptionId: string
): Promise<string> {
  // Gather all data
  const [subscriber] = await sql`
    SELECT sub.id, u.name, u.email, sub.plan, sub.created_at
    FROM accounts sub
    JOIN users u ON u.id = sub.owner_user_id
    WHERE sub.id = ${subscriptionId}
  `;
  if (!subscriber) throw new Error("Subscription not found");

  const sites = await sql`
    SELECT id, name, url, brand_voice, cadence_config, content_pillars,
           autopilot_config, autopilot_enabled, created_at
    FROM businesses WHERE billing_account_id = ${subscriptionId}
  `;

  // Create zip in memory
  const chunks: Buffer[] = [];
  const passthrough = new PassThrough();
  passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(passthrough);

  // Subscriber info
  archive.append(
    JSON.stringify(
      {
        name: subscriber.name,
        email: subscriber.email,
        plan: subscriber.plan,
        created_at: subscriber.created_at,
        exported_at: new Date().toISOString(),
      },
      null,
      2
    ),
    { name: "account.json" }
  );

  for (const site of sites) {
    const siteId = site.id as string;
    const siteName = (site.name as string) || "site";
    const prefix = sites.length > 1 ? `${siteName}/` : "";

    // Site config
    const [blogSettings] = await sql`
      SELECT blog_enabled, subdomain, custom_domain, blog_title, blog_description, theme
      FROM blog_settings WHERE business_id = ${siteId}
    `;

    archive.append(
      JSON.stringify(
        {
          name: site.name,
          url: site.url,
          brand_voice: site.brand_voice,
          cadence_config: site.cadence_config,
          content_pillars: site.content_pillars,
          autopilot_config: site.autopilot_config,
          blog_settings: blogSettings || null,
        },
        null,
        2
      ),
      { name: `${prefix}site-config.json` }
    );

    // Blog posts as markdown with frontmatter
    const posts = await sql`
      SELECT slug, title, body, excerpt, meta_title, meta_description,
             og_image_url, tags, content_pillar, status, published_at, created_at, source
      FROM blog_posts WHERE business_id = ${siteId}
      ORDER BY created_at ASC
    `;

    for (const post of posts) {
      const frontmatter = [
        "---",
        `title: "${String(post.title).replace(/"/g, '\\"')}"`,
        post.excerpt ? `excerpt: "${String(post.excerpt).replace(/"/g, '\\"')}"` : null,
        post.meta_description ? `description: "${String(post.meta_description).replace(/"/g, '\\"')}"` : null,
        post.og_image_url ? `image: "${post.og_image_url}"` : null,
        post.published_at ? `date: "${post.published_at}"` : null,
        post.content_pillar ? `pillar: "${post.content_pillar}"` : null,
        Array.isArray(post.tags) && post.tags.length > 0
          ? `tags: [${(post.tags as string[]).map((t) => `"${t}"`).join(", ")}]`
          : null,
        `status: "${post.status}"`,
        `source: "${post.source || "generated"}"`,
        "---",
      ]
        .filter(Boolean)
        .join("\n");

      archive.append(`${frontmatter}\n\n${post.body}`, {
        name: `${prefix}blog-posts/${post.slug}.md`,
      });
    }

    // Social posts as CSV
    const socialPosts = await sql`
      SELECT sp.caption, sp.platform, sp.status, sp.published_at,
             sp.platform_post_id, sa.platform_username
      FROM social_posts sp
      LEFT JOIN social_accounts sa ON sp.account_id = sa.id
      WHERE sp.business_id = ${siteId}
      ORDER BY sp.created_at ASC
    `;

    if (socialPosts.length > 0) {
      const csvHeader = "platform,account,caption,status,published_at,platform_post_id";
      const csvRows = socialPosts.map((p) => {
        const caption = String(p.caption || "").replace(/"/g, '""').replace(/\n/g, " ");
        return [
          p.platform,
          p.platform_username || "",
          `"${caption}"`,
          p.status,
          p.published_at || "",
          p.platform_post_id || "",
        ].join(",");
      });
      archive.append([csvHeader, ...csvRows].join("\n"), {
        name: `${prefix}social-posts.csv`,
      });
    }

    // Social accounts (names only, not tokens)
    const accounts = await sql`
      SELECT platform, platform_username, platform_user_id, created_at
      FROM social_accounts WHERE business_id = ${siteId}
    `;
    if (accounts.length > 0) {
      archive.append(JSON.stringify(accounts, null, 2), {
        name: `${prefix}social-accounts.json`,
      });
    }

    // SEO audits
    const audits = await sql`
      SELECT url, audit_data, score, created_at
      FROM seo_audits WHERE business_id = ${siteId}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (audits.length > 0) {
      archive.append(JSON.stringify(audits[0], null, 2), {
        name: `${prefix}seo-audit.json`,
      });
    }

    // URL map for redirects
    if (posts.length > 0 && blogSettings?.subdomain) {
      const subdomain = blogSettings.subdomain as string;
      const urlMap = posts
        .filter((p) => p.status === "published")
        .map((p) => `${subdomain}/${p.slug}`)
        .join("\n");
      archive.append(
        `# TracPost Blog URL Map\n# Use these URLs to set up redirects to your new blog host.\n\n${urlMap}\n`,
        { name: `${prefix}url-map.txt` }
      );

      // Platform-specific redirect instructions
      const redirectInfo = generateRedirectInstructions("/blog", subdomain);
      const redirectText = redirectInfo.platforms
        .map((p) => `## ${p.label}\n\n${p.instructions}\n\n\`\`\`\n${p.code}\n\`\`\``)
        .join("\n\n---\n\n");
      archive.append(
        `# Redirect Setup Instructions\n\nSet up redirects from your old blog to preserve SEO.\n\n${redirectText}\n`,
        { name: `${prefix}redirect-instructions.md` }
      );
    }
  }

  await archive.finalize();

  // Wait for all chunks
  await new Promise<void>((resolve) => passthrough.on("end", resolve));

  const buffer = Buffer.concat(chunks);

  // Upload to R2
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `exports/${subscriptionId}/${timestamp}.zip`;
  const downloadUrl = await uploadBufferToR2(key, buffer, "application/zip");

  return downloadUrl;
}
