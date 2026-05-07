import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArticleActions } from "./article-actions";

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
  hero_url: string | null;        // resolved via JOIN to media_assets
  hero_media_type: string | null; // 'image' | 'image/jpeg' | 'video' etc.
  content_tags: string[];         // v2 array (replaces singular `tags`)
  content_pillars: string[];      // v2 array (replaces singular `content_pillar`)
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
    SELECT bp.id, bp.site_id, bp.slug, bp.title, bp.body, bp.excerpt,
           bp.meta_title, bp.meta_description,
           ma.storage_url AS hero_url,
           ma.media_type AS hero_media_type,
           bp.content_tags, bp.content_pillars, bp.status,
           bp.published_at, bp.created_at, bp.updated_at
    FROM blog_posts_v2 bp
    LEFT JOIN media_assets ma ON ma.id = bp.hero_asset_id
    WHERE bp.id = ${id}
      AND bp.site_id = ${session.activeSiteId}
    LIMIT 1
  `) as BlogArticle[];

  if (!article) notFound();

  // Resolve every {{asset:UUID}} placeholder in the body to its
  // storage_url + media_type. Used by the body renderer below to swap
  // placeholders for inline <img>/<video> elements.
  const placeholderIds = Array.from(
    new Set((article.body.match(/\{\{asset:([0-9a-f-]{36})\}\}/g) || []).map(
      (m) => m.slice("{{asset:".length, -2),
    )),
  );
  const assetRows = placeholderIds.length > 0
    ? await sql`
        SELECT id, storage_url, media_type, context_note
        FROM media_assets
        WHERE id = ANY(${placeholderIds}::uuid[])
      `
    : [];
  const assetMap = new Map(
    assetRows.map((a) => [
      a.id as string,
      {
        url: a.storage_url as string,
        mediaType: a.media_type as string,
        alt: (a.context_note as string | null) || article.title,
      },
    ]),
  );

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
          <ArticleActions articleId={article.id} status={article.status} />
        </div>
      </header>

      <article className="rounded-xl border border-border bg-surface shadow-card">
        {/* Hero is rendered inline as the body's first {{asset:UUID}} placeholder.
            We deliberately do NOT also render a separate hero element here —
            that would duplicate the hero (LLM places it at body[0]). The
            body renderer below resolves the placeholder. */}
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
            {article.content_pillars && article.content_pillars.length > 0 && (
              <span>
                <span className="font-medium text-foreground">Pillars:</span>{" "}
                {article.content_pillars.join(", ")}
              </span>
            )}
            <span>
              <span className="font-medium text-foreground">Slug:</span>{" "}
              <span className="font-mono">{article.slug}</span>
            </span>
            {article.content_tags && article.content_tags.length > 0 && (
              <span>
                <span className="font-medium text-foreground">Tags:</span>{" "}
                {article.content_tags.join(", ")}
              </span>
            )}
          </div>

          {/* Body — split on {{asset:UUID}} placeholders. Each segment
              between placeholders renders as preformatted text (markdown
              source, intentionally — operator review surface, not the
              live render). Each placeholder resolves to an inline
              <img>/<video> element from media_assets. Unknown placeholders
              render as a small dim hint. */}
          <div className="prose prose-sm max-w-none space-y-4">
            {renderBody(article.body, assetMap)}
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

/**
 * Render the article body with {{asset:UUID}} placeholders replaced by
 * inline <img> / <video> elements. Splits on the placeholder regex and
 * renders each segment + asset as siblings so the visual flow matches
 * what readers will see on the live article surface (once the renderer
 * cutover lands).
 */
function renderBody(
  body: string,
  assetMap: Map<string, { url: string; mediaType: string; alt: string }>,
) {
  const placeholderRegex = /\{\{asset:([0-9a-f-]{36})\}\}/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = placeholderRegex.exec(body)) !== null) {
    const text = body.slice(lastIndex, m.index);
    if (text.trim().length > 0) {
      nodes.push(
        <pre
          key={`t-${key++}`}
          className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 m-0"
        >
          {text}
        </pre>,
      );
    }
    const asset = assetMap.get(m[1]);
    if (asset) {
      nodes.push(<AssetEmbed key={`a-${key++}`} asset={asset} />);
    } else {
      // Unknown placeholder — show a dim hint so the operator can spot orphans
      nodes.push(
        <div
          key={`u-${key++}`}
          className="text-[11px] text-muted italic border border-dashed border-border rounded p-2"
        >
          [unresolved asset {m[1].slice(0, 8)}…]
        </div>,
      );
    }
    lastIndex = m.index + m[0].length;
  }
  // Trailing text after the last placeholder
  const tail = body.slice(lastIndex);
  if (tail.trim().length > 0) {
    nodes.push(
      <pre
        key={`t-${key++}`}
        className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 m-0"
      >
        {tail}
      </pre>,
    );
  }
  return nodes;
}

function AssetEmbed({
  asset,
}: {
  asset: { url: string; mediaType: string; alt: string };
}) {
  const isVideo = asset.mediaType.startsWith("video");
  if (isVideo) {
    return (
      <video
        src={asset.url}
        autoPlay
        muted
        loop
        playsInline
        className="w-full rounded-lg bg-black"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.url}
      alt={asset.alt}
      className="w-full rounded-lg object-cover"
    />
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
