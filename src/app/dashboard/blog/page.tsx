import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BlogPostList } from "./blog-post-list";

export const dynamic = "force-dynamic";

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ status?: string; sort?: string; page?: string }>;
}

export default async function BlogPage({ searchParams }: Props) {
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
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const sortOrder = params.sort || "newest";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));
  const offset = (currentPage - 1) * PER_PAGE;

  // Post queries — branch on status filter and sort
  // Count query for pagination
  let posts;
  let totalCount;

  if (statusFilter === "all") {
    if (sortOrder === "oldest") {
      posts = await sql`
        SELECT id, slug, title, excerpt, body, og_image_url, status,
               content_type, content_pillar, metadata, published_at, created_at
        FROM blog_posts WHERE site_id = ${siteId}
        ORDER BY created_at ASC LIMIT ${PER_PAGE} OFFSET ${offset}
      `;
    } else if (sortOrder === "title") {
      posts = await sql`
        SELECT id, slug, title, excerpt, body, og_image_url, status,
               content_type, content_pillar, metadata, published_at, created_at
        FROM blog_posts WHERE site_id = ${siteId}
        ORDER BY title ASC LIMIT ${PER_PAGE} OFFSET ${offset}
      `;
    } else {
      posts = await sql`
        SELECT id, slug, title, excerpt, body, og_image_url, status,
               content_type, content_pillar, metadata, published_at, created_at
        FROM blog_posts WHERE site_id = ${siteId}
        ORDER BY created_at DESC LIMIT ${PER_PAGE} OFFSET ${offset}
      `;
    }
    const [countRow] = await sql`SELECT COUNT(*)::int AS total FROM blog_posts WHERE site_id = ${siteId}`;
    totalCount = countRow?.total || 0;
  } else {
    if (sortOrder === "oldest") {
      posts = await sql`
        SELECT id, slug, title, excerpt, body, og_image_url, status,
               content_type, content_pillar, metadata, published_at, created_at
        FROM blog_posts WHERE site_id = ${siteId} AND status = ${statusFilter}
        ORDER BY created_at ASC LIMIT ${PER_PAGE} OFFSET ${offset}
      `;
    } else if (sortOrder === "title") {
      posts = await sql`
        SELECT id, slug, title, excerpt, body, og_image_url, status,
               content_type, content_pillar, metadata, published_at, created_at
        FROM blog_posts WHERE site_id = ${siteId} AND status = ${statusFilter}
        ORDER BY title ASC LIMIT ${PER_PAGE} OFFSET ${offset}
      `;
    } else {
      posts = await sql`
        SELECT id, slug, title, excerpt, body, og_image_url, status,
               content_type, content_pillar, metadata, published_at, created_at
        FROM blog_posts WHERE site_id = ${siteId} AND status = ${statusFilter}
        ORDER BY created_at DESC LIMIT ${PER_PAGE} OFFSET ${offset}
      `;
    }
    const [countRow] = await sql`SELECT COUNT(*)::int AS total FROM blog_posts WHERE site_id = ${siteId} AND status = ${statusFilter}`;
    totalCount = countRow?.total || 0;
  }

  // Status counts for filter badges
  const statusCounts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
      COUNT(*) FILTER (WHERE status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE status = 'flagged')::int AS flagged
    FROM blog_posts WHERE site_id = ${siteId}
  `;
  const counts = statusCounts[0] || { total: 0, draft: 0, published: 0, flagged: 0 };

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="mb-1 text-lg font-semibold">Blog</h1>
        <p className="text-sm text-muted">
          Review and publish generated posts
        </p>
      </div>

      <BlogPostList
        posts={posts as Array<{
          id: string; slug: string; title: string; excerpt: string | null;
          body: string | null; og_image_url: string | null; status: string;
          content_type: string | null; content_pillar: string | null;
          metadata: Record<string, unknown> | null;
          published_at: string | null; created_at: string;
        }>}
        statusFilter={statusFilter}
        sortOrder={sortOrder}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        counts={counts as { total: number; draft: number; published: number; flagged: number }}
      />
    </div>
  );
}
