import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface BlogArticle {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  tags: string[];
  content_pillar: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BlogSettingsRow {
  blog_title: string | null;
  subdomain: string | null;
  custom_domain: string | null;
}

/**
 * Article review surface — long-form proofing view for blog articles.
 *
 * Phase 3c of the publish-module refactor (task #82). Subscribers reach
 * this from clicking an article card in Unifeed. Long-form content
 * needs a dedicated review surface — 1500 words doesn't review well
 * inline in a feed grid.
 *
 * v1 scope: read-only review with metadata, status badge, and link to
 * the live article. Status changes + full editor wire in via the
 * existing blog management surface (link out for now). Future
 * enhancement: in-place status toggle + body editor lands here so the
 * /dashboard/blog standalone surface can be deprecated entirely.
 */
export default async function ArticleReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const { id } = await params;

  const [article] = (await sql`
    SELECT id, site_id, slug, title, body, excerpt,
           meta_title, meta_description, og_image_url,
           tags, content_pillar, status,
           published_at, created_at, updated_at
    FROM blog_posts
    WHERE id = ${id}
      AND site_id = ${session.activeSiteId}
    LIMIT 1
  `) as BlogArticle[];

  if (!article) notFound();

  const [settings] = (await sql`
    SELECT blog_title, subdomain, custom_domain
    FROM blog_settings
    WHERE site_id = ${session.activeSiteId}
    LIMIT 1
  `) as BlogSettingsRow[];

  const liveUrl =
    article.status === "published"
      ? settings?.custom_domain
        ? `https://${settings.custom_domain}/${article.slug}`
        : settings?.subdomain
          ? `https://${settings.subdomain}.tracpost.com/${article.slug}`
          : null
      : null;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/unifeed?platform=blog"
          className="text-xs text-muted hover:text-foreground"
        >
          ← Back to Unifeed
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={article.status} />
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
            >
              View live ↗
            </a>
          )}
          <Link
            href="/dashboard/blog"
            className="rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground hover:bg-surface-hover"
          >
            Manage in Blog →
          </Link>
        </div>
      </header>

      <article className="rounded-xl border border-border bg-surface shadow-card">
        {article.og_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.og_image_url}
            alt={article.title}
            className="w-full aspect-[16/9] object-cover rounded-t-xl"
          />
        )}
        <div className="p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{article.title}</h1>
            {article.excerpt && (
              <p className="mt-2 text-sm text-muted leading-relaxed">{article.excerpt}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted border-y border-border py-2">
            <span>
              <span className="font-medium text-foreground">Status:</span> {article.status}
            </span>
            {article.published_at && (
              <span>
                <span className="font-medium text-foreground">Published:</span>{" "}
                {new Date(article.published_at).toLocaleString()}
              </span>
            )}
            {article.content_pillar && (
              <span>
                <span className="font-medium text-foreground">Pillar:</span>{" "}
                {article.content_pillar}
              </span>
            )}
            <span>
              <span className="font-medium text-foreground">Slug:</span>{" "}
              <span className="font-mono">{article.slug}</span>
            </span>
            {article.tags && article.tags.length > 0 && (
              <span>
                <span className="font-medium text-foreground">Tags:</span>{" "}
                {article.tags.join(", ")}
              </span>
            )}
          </div>

          {/* Body — render the markdown/HTML body. For v1 we do a basic
              prose render. If body is HTML, dangerouslySetInnerHTML is
              needed; if markdown, a markdown library renders it. The
              existing blog management surface handles both — for the
              review-only view we render as preformatted text to avoid
              XSS surface area until we know the source format with
              certainty. Subscribers see the rendered version on the
              live article.  */}
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0">
              {article.body}
            </pre>
          </div>

          {(article.meta_title || article.meta_description) && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-foreground">
                SEO metadata
              </summary>
              <dl className="mt-2 space-y-1.5">
                {article.meta_title && (
                  <>
                    <dt className="font-medium text-foreground">Meta title</dt>
                    <dd className="text-muted">{article.meta_title}</dd>
                  </>
                )}
                {article.meta_description && (
                  <>
                    <dt className="font-medium text-foreground">Meta description</dt>
                    <dd className="text-muted">{article.meta_description}</dd>
                  </>
                )}
              </dl>
            </details>
          )}
        </div>
      </article>

      <footer className="text-[11px] text-muted">
        Article ID: <span className="font-mono">{article.id}</span>
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: "bg-success/10 text-success",
    draft: "bg-muted/10 text-muted",
    archived: "bg-warning/10 text-warning",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${colors[status] || "bg-muted/10 text-muted"}`}
    >
      {status}
    </span>
  );
}
