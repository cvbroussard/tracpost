import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BlogDashboard } from "./blog-dashboard";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold">Blog</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [posts, settingsRows] = await Promise.all([
    sql`
      SELECT id, slug, title, excerpt, og_image_url, status,
             content_pillar, published_at, created_at
      FROM blog_posts
      WHERE site_id = ${siteId}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    sql`
      SELECT blog_enabled, subdomain, custom_domain, blog_title, blog_description
      FROM blog_settings
      WHERE site_id = ${siteId}
    `,
  ]);

  const settings = settingsRows[0] || {
    blog_enabled: false,
    subdomain: null,
    custom_domain: null,
    blog_title: null,
    blog_description: null,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Blog</h1>
      <p className="mb-8 text-sm text-muted">
        {settings.blog_enabled
          ? "Blog is active — posts generate automatically from your uploads"
          : "Enable the blog to auto-generate posts from your content"}
      </p>

      <BlogDashboard
        siteId={siteId}
        initialSettings={settings as Parameters<typeof BlogDashboard>[0]["initialSettings"]}
        initialPosts={posts as Parameters<typeof BlogDashboard>[0]["initialPosts"]}
      />
    </div>
  );
}
