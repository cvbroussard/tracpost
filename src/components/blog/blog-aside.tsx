import Link from "next/link";

interface RecentPost {
  slug: string;
  title: string;
  published_at: string;
}

interface BlogAsideProps {
  siteSlug: string;
  recentPosts: RecentPost[];
  pillars: string[];
  aboutText?: string;
}

export default function BlogAside({ siteSlug, recentPosts, pillars, aboutText }: BlogAsideProps) {
  return (
    <>
      {/* About */}
      {aboutText && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">About</h3>
          <p style={{ fontSize: 14, color: "var(--bs-muted)", lineHeight: 1.6 }}>
            {aboutText}
          </p>
        </div>
      )}

      {/* Categories / Pillars */}
      {pillars.length > 0 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Categories</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pillars.map((pillar) => (
              <Link
                key={pillar}
                href={`/blog/${siteSlug}?pillar=${encodeURIComponent(pillar)}`}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--bs-radius)",
                  border: "1px solid var(--bs-border)",
                  color: "var(--bs-muted)",
                  textDecoration: "none",
                }}
              >
                {pillar}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Posts */}
      {recentPosts.length > 0 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Recent Posts</h3>
          <ul className="bs-aside-list">
            {recentPosts.slice(0, 5).map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${siteSlug}/${post.slug}`}>
                  {post.title}
                </Link>
                <div className="bs-aside-date">
                  {new Date(post.published_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
