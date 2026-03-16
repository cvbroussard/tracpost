import { headers } from "next/headers";
import Link from "next/link";
import { resolveBlogSite, getBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function BlogIndex() {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  if (!site) {
    return (
      <div className="py-20 text-center">
        <h1 className="mb-2 text-lg font-semibold">Blog not found</h1>
        <p className="text-sm text-muted">This blog hasn't been configured yet.</p>
      </div>
    );
  }

  const posts = await getBlogPosts(site.siteId);

  return (
    <div>
      <header className="mb-12">
        <h1 className="mb-2 text-2xl font-bold">{site.blogTitle || site.siteName}</h1>
        {site.blogDescription && (
          <p className="text-muted">{site.blogDescription}</p>
        )}
      </header>

      {posts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No posts yet.</p>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => {
            const id = String(post.id);
            const slug = String(post.slug);
            const title = String(post.title);
            const excerpt = post.excerpt ? String(post.excerpt) : null;
            const ogImage = post.og_image_url ? String(post.og_image_url) : null;
            const pillar = post.content_pillar ? String(post.content_pillar) : null;
            const pubDate = post.published_at ? String(post.published_at) : null;

            return (
              <article
                key={id}
                className="group rounded-lg border border-border bg-surface p-6 transition-colors hover:border-accent/40"
              >
                <Link href={`/blog/${slug}`}>
                  {ogImage && (
                    <img
                      src={ogImage}
                      alt={title}
                      className="mb-4 aspect-video w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  )}
                  <h2 className="mb-2 text-lg font-semibold group-hover:text-accent">
                    {title}
                  </h2>
                  {excerpt && (
                    <p className="mb-3 text-sm text-muted">{excerpt}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted">
                    {pubDate && (
                      <time>
                        {new Date(pubDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </time>
                    )}
                    {pillar && (
                      <span className="rounded bg-surface-hover px-2 py-0.5">
                        {pillar}
                      </span>
                    )}
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
