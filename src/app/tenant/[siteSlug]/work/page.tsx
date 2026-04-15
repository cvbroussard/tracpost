import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadTenantContext, loadWorkPage, loadPageMetadata, slotByKey } from "@/lib/tenant-site";
import { projectUrl, blogArticleUrl, blogHubUrl } from "@/lib/urls";
import MarketingShell from "@/components/marketing/marketing-shell";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const meta = await loadPageMetadata(ctx.siteId, "work");
  return {
    title: meta.title,
    description: meta.description,
    ...(ctx.faviconUrl ? { icons: { icon: ctx.faviconUrl } } : {}),
  };
}

export default async function TenantWorkPage({ params }: Props) {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();
  if (!slotByKey(ctx.pageConfig, "work").enabled) notFound();

  const data = await loadWorkPage(ctx.siteId);

  return (
    <MarketingShell ctx={ctx} activePage="work">
      <section className="ws-work-hero">
        <div className="ws-container">
          <h1 className="ws-work-title">{data.headline}</h1>
          {data.subtitle && <p className="ws-work-subtitle">{data.subtitle}</p>}
        </div>
      </section>

      {data.projects.length > 0 && (
        <section className="ws-section">
          <div className="ws-container">
            <div className="ws-projects-grid">
              {data.projects.map((p) => (
                <a
                  key={p.slug}
                  href={projectUrl(ctx.siteSlug, p.slug, ctx.customDomain)}
                  className="ws-project-card"
                >
                  {p.coverImage ? (
                    <img src={p.coverImage} alt={p.name} className="ws-project-cover" />
                  ) : (
                    <div className="ws-project-cover-empty" />
                  )}
                  <div className="ws-project-info">
                    <h3 className="ws-project-name">{p.name}</h3>
                    {p.description && (
                      <p className="ws-project-desc">{p.description}</p>
                    )}
                    <span className="ws-project-meta">{p.assetCount} photos</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {data.articles.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.blogTitle}</h2>
            {data.blogSubtitle && (
              <p className="ws-section-subtitle">{data.blogSubtitle}</p>
            )}
            <div className="ws-articles-grid">
              {data.articles.map((a) => (
                <a
                  key={a.slug}
                  href={blogArticleUrl(ctx.siteSlug, a.slug, ctx.customDomain)}
                  className="ws-article-card"
                >
                  {a.image && <img src={a.image} alt={a.title} className="ws-article-img" />}
                  <div className="ws-article-info">
                    <h3 className="ws-article-title">{a.title}</h3>
                    {a.excerpt && <p className="ws-article-excerpt">{a.excerpt}</p>}
                    {a.date && <span className="ws-article-date">{a.date}</span>}
                  </div>
                </a>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <a
                href={blogHubUrl(ctx.siteSlug, ctx.customDomain)}
                className="ws-btn ws-btn-outline"
              >
                All Articles
              </a>
            </div>
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: workStyles }} />
    </MarketingShell>
  );
}

const workStyles = `
  .ws-work-hero {
    padding: 80px 0 40px;
    border-bottom: 1px solid var(--ws-border);
  }
  .ws-work-title {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.03em;
    margin-bottom: 12px;
  }
  .ws-work-subtitle {
    font-size: 17px;
    color: var(--ws-muted);
    max-width: 600px;
    line-height: 1.6;
  }

  .ws-projects-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 32px;
  }
  @media (max-width: 768px) { .ws-projects-grid { grid-template-columns: 1fr; } }
  .ws-project-card {
    display: block;
    text-decoration: none;
    color: inherit;
    border-radius: var(--ws-radius);
    overflow: hidden;
    border: 1px solid var(--ws-border);
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .ws-project-card:hover {
    box-shadow: 0 6px 24px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }
  .ws-project-cover { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; }
  .ws-project-cover-empty {
    width: 100%;
    aspect-ratio: 3 / 2;
    background: var(--ws-border);
  }
  .ws-project-info { padding: 20px; }
  .ws-project-name {
    font-family: var(--ws-heading-font);
    font-size: 20px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 6px;
  }
  .ws-project-desc {
    font-size: 14px;
    color: var(--ws-muted);
    margin-bottom: 10px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ws-project-meta {
    font-size: 12px;
    color: var(--ws-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ws-articles-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 768px) { .ws-articles-grid { grid-template-columns: 1fr; } }
  .ws-article-card {
    display: block;
    text-decoration: none;
    color: inherit;
    border-radius: var(--ws-radius);
    overflow: hidden;
    background: var(--ws-bg);
    transition: transform 0.2s;
  }
  .ws-article-card:hover { transform: translateY(-2px); }
  .ws-article-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .ws-article-info { padding: 16px 0; }
  .ws-article-title {
    font-family: var(--ws-heading-font);
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .ws-article-excerpt {
    font-size: 14px;
    color: var(--ws-muted);
    line-height: 1.5;
    margin-bottom: 8px;
  }
  .ws-article-date {
    font-size: 12px;
    color: var(--ws-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;
