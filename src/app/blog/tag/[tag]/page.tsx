import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSite } from "@/lib/blog";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ tag: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);
  const label = decodeURIComponent(tag);

  return {
    title: `${label} — ${site?.blogTitle || site?.siteName || "Blog"}`,
    description: `Posts tagged with ${label}`,
  };
}

export default async function TagArchivePage({ params }: Props) {
  const { tag } = await params;
  const label = decodeURIComponent(tag);
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  if (!site) notFound();

  const posts = await sql`
    SELECT id, slug, title, excerpt, content_pillar, tags, published_at
    FROM blog_posts
    WHERE site_id = ${site.siteId} AND status = 'published' AND ${label} = ANY(tags)
    ORDER BY published_at DESC
  `;

  return (
    <div>
      <Link
        href="/blog"
        className="blog-muted"
        style={{ fontSize: 14, textDecoration: "none", display: "inline-block", marginBottom: 32 }}
      >
        &larr; All Posts
      </Link>

      <header style={{ marginBottom: 48 }}>
        <h1>#{label}</h1>
        <p className="blog-muted" style={{ marginTop: 8 }}>
          {posts.length} post{posts.length !== 1 ? "s" : ""}
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="blog-muted" style={{ textAlign: "center", padding: "48px 0" }}>
          No posts with this tag yet.
        </p>
      ) : (
        <div>
          {posts.map((post) => (
            <article
              key={String(post.id)}
              style={{ borderBottom: "1px solid var(--blog-border)", padding: "24px 0" }}
            >
              <Link href={`/blog/${post.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 0, marginBottom: 6 }}>
                  {String(post.title)}
                </h2>
                {post.excerpt && (
                  <p className="blog-muted" style={{ fontSize: 15, marginBottom: 8 }}>
                    {String(post.excerpt)}
                  </p>
                )}
              </Link>
              <div style={{ fontSize: 13 }} className="blog-muted">
                {post.published_at && (
                  <time>
                    {new Date(String(post.published_at)).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                )}
                {post.content_pillar && (
                  <span> · {String(post.content_pillar)}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
