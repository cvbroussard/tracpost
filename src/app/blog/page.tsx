import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveBlogSite, getBlogPosts } from "@/lib/blog";
import { sql } from "@/lib/db";
import { checkDepartureRedirect } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function BlogIndex() {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  if (!site) {
    const redirectTarget = await checkDepartureRedirect(blogHost);
    if (redirectTarget) redirect(redirectTarget);

    return (
      <div style={{ padding: "80px 0", textAlign: "center" }}>
        <h1>Blog not found</h1>
        <p className="blog-muted" style={{ marginTop: 8 }}>This blog hasn't been configured yet.</p>
      </div>
    );
  }

  const posts = await getBlogPosts(site.siteId);

  // Get unique pillars for filter chips
  const pillars = [...new Set(posts.map((p) => p.content_pillar as string).filter(Boolean))];

  return (
    <div>
      <header style={{ marginBottom: 48 }}>
        <h1>{site.blogTitle || site.siteName}</h1>
        {site.blogDescription && (
          <p className="blog-muted" style={{ marginTop: 8, fontSize: 17 }}>
            {site.blogDescription}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
          {pillars.map((pillar) => (
            <Link
              key={pillar}
              href={`/blog/pillar/${encodeURIComponent(pillar)}`}
              style={{
                fontSize: 13,
                padding: "4px 12px",
                borderRadius: "var(--blog-radius)",
                border: "1px solid var(--blog-border)",
                color: "var(--blog-muted)",
                textDecoration: "none",
              }}
            >
              {pillar}
            </Link>
          ))}
          <Link
            href="/blog/feed.xml"
            style={{ fontSize: 13, color: "var(--blog-muted)", textDecoration: "none", marginLeft: "auto" }}
          >
            RSS
          </Link>
        </div>
      </header>

      {posts.length === 0 ? (
        <p className="blog-muted" style={{ padding: "48px 0", textAlign: "center" }}>
          No posts yet.
        </p>
      ) : (
        <div>
          {posts.map((post) => {
            const slug = String(post.slug);
            const title = String(post.title);
            const excerpt = post.excerpt ? String(post.excerpt) : null;
            const pillar = post.content_pillar ? String(post.content_pillar) : null;
            const pubDate = post.published_at ? String(post.published_at) : null;
            const tags = Array.isArray(post.tags) ? (post.tags as string[]) : [];

            return (
              <article
                key={String(post.id)}
                style={{ borderBottom: "1px solid var(--blog-border)", padding: "24px 0" }}
              >
                <Link href={`/blog/${slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0, marginBottom: 6 }}>
                    {title}
                  </h2>
                  {excerpt && (
                    <p className="blog-muted" style={{ fontSize: 15, marginBottom: 8 }}>
                      {excerpt}
                    </p>
                  )}
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  {pubDate && (
                    <time className="blog-muted">
                      {new Date(pubDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  )}
                  {pillar && (
                    <Link
                      href={`/blog/pillar/${encodeURIComponent(pillar)}`}
                      className="blog-muted"
                      style={{ textDecoration: "none" }}
                    >
                      · {pillar}
                    </Link>
                  )}
                  {tags.slice(0, 3).map((tag) => (
                    <Link
                      key={tag}
                      href={`/blog/tag/${encodeURIComponent(tag)}`}
                      className="blog-muted"
                      style={{ textDecoration: "none" }}
                    >
                      · {tag}
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
