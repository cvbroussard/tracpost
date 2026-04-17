import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { BlogHub } from "@/components/marketing-platform/blog-hub";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog — TracPost",
  description: "Product updates, case studies, and insights from TracPost — the AI-powered content automation platform.",
};

export default async function MarketingBlogPage() {
  const [site] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost'`;
  if (!site) {
    return (
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h1 className="mp-section-title">Blog</h1>
          <p className="mp-section-subtitle">No posts yet.</p>
        </div>
      </section>
    );
  }

  const siteId = site.id as string;

  const posts = await sql`
    SELECT slug, title, excerpt, og_image_url, published_at,
           content_type, content_pillar, content_tags
    FROM blog_posts
    WHERE site_id = ${siteId} AND status = 'published'
    ORDER BY published_at DESC NULLS LAST
    LIMIT 60
  `;

  const categories = new Set<string>();
  const articles = posts.map((p) => {
    const cat = (p.content_type as string) || (p.content_pillar as string) || "Insight";
    categories.add(cat);
    return {
      slug: String(p.slug),
      title: String(p.title),
      excerpt: p.excerpt ? String(p.excerpt).slice(0, 160) : null,
      image: p.og_image_url ? String(p.og_image_url) : null,
      date: p.published_at
        ? new Date(String(p.published_at)).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : null,
      category: cat,
    };
  });

  return (
    <section className="mp-section" style={{ paddingTop: 48 }}>
      <div className="mp-container">
        <BlogHub
          articles={articles}
          categories={["All", ...Array.from(categories)]}
        />
      </div>
    </section>
  );
}
