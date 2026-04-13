import Link from "next/link";
import { blogArticleUrl } from "@/lib/urls";

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string | null;
  og_image_url: string | null;
  content_pillar: string | null;
  published_at: string;
}

interface HubArticlesProps {
  posts: BlogPost[];
  siteSlug: string;
  customDomain?: string | null;
}

export default function HubArticles({ posts, siteSlug, customDomain }: HubArticlesProps) {
  if (posts.length === 0) return null;

  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 20, marginTop: 0, marginBottom: 16 }}>Recent Articles</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {posts.map((post) => (
          <article
            key={post.slug}
            style={{ borderBottom: "1px solid var(--blog-border)", padding: "20px 0" }}
          >
            <Link
              href={blogArticleUrl(siteSlug, post.slug, customDomain)}
              style={{ textDecoration: "none", color: "inherit", display: "flex", gap: 16 }}
            >
              {post.og_image_url && (
                <img
                  src={post.og_image_url}
                  alt={post.title}
                  loading="lazy"
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "var(--blog-radius)",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 4px", lineHeight: 1.3 }}>
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p
                    className="blog-muted"
                    style={{
                      fontSize: 14,
                      margin: "0 0 6px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {post.excerpt}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <time className="blog-muted">
                    {new Date(post.published_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                  {post.content_pillar && (
                    <span className="blog-muted">· {post.content_pillar}</span>
                  )}
                </div>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
