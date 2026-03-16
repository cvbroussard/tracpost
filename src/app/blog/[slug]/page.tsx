import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveBlogSite, getBlogPost } from "@/lib/blog";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);
  if (!site) return {};

  const post = await getBlogPost(site.siteId, slug);
  if (!post) return {};

  return {
    title: (post.meta_title as string) || (post.title as string),
    description: (post.meta_description as string) || (post.excerpt as string),
    openGraph: {
      title: (post.meta_title as string) || (post.title as string),
      description: (post.meta_description as string) || (post.excerpt as string),
      images: post.og_image_url ? [post.og_image_url as string] : undefined,
      type: "article",
      publishedTime: post.published_at as string,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  if (!site) notFound();

  const post = await getBlogPost(site.siteId, slug);
  if (!post) notFound();

  const schemaJson = post.schema_json as Record<string, unknown> | null;

  return (
    <article>
      {/* JSON-LD schema */}
      {schemaJson && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
        />
      )}

      <Link href="/blog" className="mb-6 inline-block text-xs text-accent hover:underline">
        &larr; All Posts
      </Link>

      <header className="mb-8">
        <h1 className="mb-3 text-2xl font-bold leading-tight">
          {String(post.title)}
        </h1>
        <div className="flex items-center gap-3 text-xs text-muted">
          {post.published_at ? (
            <time>
              {new Date(String(post.published_at)).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          ) : null}
          {post.content_pillar ? (
            <span className="rounded bg-surface-hover px-2 py-0.5">
              {String(post.content_pillar)}
            </span>
          ) : null}
        </div>
      </header>

      {post.og_image_url ? (
        <img
          src={String(post.og_image_url)}
          alt={String(post.title)}
          className="mb-8 w-full rounded-lg object-cover"
        />
      ) : null}

      {/* Blog body — rendered as HTML from markdown */}
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(String(post.body)) }}
      />

      {/* Tags */}
      {Array.isArray(post.tags) && post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {(post.tags as string[]).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-hover px-3 py-1 text-xs text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * Simple markdown→HTML converter for blog body content.
 * Handles headings, paragraphs, bold, italic, links, and lists.
 */
function markdownToHtml(md: string): string {
  return md
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-accent hover:underline">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Paragraphs (double newline)
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<ul")) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}
