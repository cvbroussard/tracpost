import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { resolveBlogSite } from "@/lib/blog";
import { sql } from "@/lib/db";

const geist = Geist({
  variable: "--font-blog",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  const title = site?.blogTitle || site?.siteName || "Blog";
  const description = site?.blogDescription || "Latest posts";

  return {
    title,
    description,
    robots: "index, follow",
    alternates: {
      types: { "application/rss+xml": "/blog/feed.xml" },
    },
  };
}

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  // Load theme from blog_settings if available
  let theme: Record<string, string> | null = null;
  if (site?.siteId) {
    const [settings] = await sql`
      SELECT theme FROM blog_settings WHERE site_id = ${site.siteId}
    `;
    theme = (settings?.theme as Record<string, string>) || null;
  }

  return (
    <div className={`${geist.variable} blog-shell`}>
      {/* Inject brand theme tokens if available */}
      {theme && (
        <style dangerouslySetInnerHTML={{ __html: `
          .blog-shell {
            ${theme.primaryColor ? `--blog-primary: ${theme.primaryColor};` : ""}
            ${theme.textColor ? `--blog-text: ${theme.textColor};` : ""}
            ${theme.backgroundColor ? `--blog-bg: ${theme.backgroundColor};` : ""}
            ${theme.fontFamily ? `--blog-font: ${theme.fontFamily};` : ""}
            ${theme.headingFontFamily ? `--blog-heading-font: ${theme.headingFontFamily};` : ""}
            ${theme.borderRadius ? `--blog-radius: ${theme.borderRadius};` : ""}
            ${theme.accentColor ? `--blog-accent: ${theme.accentColor};` : ""}
          }
        `}} />
      )}
      <div className="blog-container">
        {children}
      </div>
      <style dangerouslySetInnerHTML={{ __html: blogStyles }} />
    </div>
  );
}

const blogStyles = `
  .blog-shell {
    --blog-primary: #1a1a1a;
    --blog-text: #1a1a1a;
    --blog-bg: #ffffff;
    --blog-muted: #6b7280;
    --blog-border: #e5e7eb;
    --blog-accent: #3b82f6;
    --blog-font: var(--font-blog), system-ui, sans-serif;
    --blog-heading-font: var(--font-blog), system-ui, sans-serif;
    --blog-radius: 8px;

    font-family: var(--blog-font);
    color: var(--blog-text);
    background: var(--blog-bg);
    min-height: 100vh;
  }

  .blog-container {
    max-width: 680px;
    margin: 0 auto;
    padding: 48px 24px 96px;
  }

  /* Typography */
  .blog-shell h1 {
    font-family: var(--blog-heading-font);
    font-size: 32px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: var(--blog-primary);
  }

  .blog-shell h2 {
    font-family: var(--blog-heading-font);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--blog-primary);
    margin-top: 2em;
    margin-bottom: 0.5em;
  }

  .blog-shell h3 {
    font-family: var(--blog-heading-font);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--blog-primary);
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }

  /* Prose body */
  .blog-prose {
    font-size: 17px;
    line-height: 1.7;
    color: var(--blog-text);
  }

  .blog-prose p {
    margin-bottom: 1.25em;
  }

  .blog-prose a {
    color: var(--blog-accent);
    text-decoration: none;
  }

  .blog-prose a:hover {
    text-decoration: underline;
  }

  .blog-prose strong {
    font-weight: 600;
    color: var(--blog-primary);
  }

  .blog-prose ul, .blog-prose ol {
    margin-bottom: 1.25em;
    padding-left: 1.5em;
  }

  .blog-prose li {
    margin-bottom: 0.4em;
  }

  .blog-prose img {
    width: 100%;
    border-radius: var(--blog-radius);
    margin: 1.5em 0;
  }

  .blog-prose blockquote {
    border-left: 3px solid var(--blog-border);
    padding-left: 1em;
    margin: 1.5em 0;
    color: var(--blog-muted);
    font-style: italic;
  }

  .blog-prose code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: 'Geist Mono', monospace;
  }

  .blog-prose pre {
    background: #f3f4f6;
    padding: 16px;
    border-radius: var(--blog-radius);
    overflow-x: auto;
    margin: 1.5em 0;
  }

  .blog-prose pre code {
    background: none;
    padding: 0;
  }

  /* Utility classes for blog */
  .blog-muted { color: var(--blog-muted); }
  .blog-accent { color: var(--blog-accent); }
  .blog-border { border-color: var(--blog-border); }
`;
