import React from "react";

export interface WorkPageData {
  headline: string;
  subtitle: string;
  projects: Array<{
    name: string;
    description?: string;
    coverImage?: string;
    assetCount: number;
    href: string;
  }>;
  blogTitle: string;
  blogSubtitle: string;
  articles: Array<{
    title: string;
    excerpt?: string;
    image?: string;
    href: string;
    date: string;
  }>;
}

export default function WorkPage({ data }: { data: WorkPageData }) {
  return (
    <>
      {/* Projects */}
      <section className="ws-section">
        <div className="ws-container">
          <h1 className="ws-section-title">{data.headline}</h1>
          <p className="ws-section-subtitle">{data.subtitle}</p>
          <div className="ws-work-grid">
            {data.projects.map((project, i) => (
              <a key={i} href={project.href} className="ws-work-card">
                {project.coverImage ? (
                  <img src={project.coverImage} alt={project.name} className="ws-work-img" />
                ) : (
                  <div className="ws-work-img-empty" />
                )}
                <div className="ws-work-info">
                  <h2 className="ws-work-name">{project.name}</h2>
                  {project.description && (
                    <p className="ws-work-desc">{project.description}</p>
                  )}
                  <span className="ws-work-meta">{project.assetCount} photos</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Recent articles */}
      {data.articles.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.blogTitle}</h2>
            <p className="ws-section-subtitle">{data.blogSubtitle}</p>
            <div className="ws-articles-grid">
              {data.articles.slice(0, 3).map((article, i) => (
                <a key={i} href={article.href} className="ws-article-card">
                  {article.image && (
                    <img src={article.image} alt={article.title} className="ws-article-img" />
                  )}
                  <div className="ws-article-info">
                    <h3 className="ws-article-title">{article.title}</h3>
                    {article.excerpt && (
                      <p className="ws-article-excerpt">{article.excerpt}</p>
                    )}
                    <span className="ws-article-date">{article.date}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: workStyles }} />
    </>
  );
}

const workStyles = `
  .ws-work-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }

  @media (max-width: 640px) {
    .ws-work-grid { grid-template-columns: 1fr; }
  }

  .ws-work-card {
    text-decoration: none;
    color: inherit;
    border-radius: var(--ws-radius);
    overflow: hidden;
    border: 1px solid var(--ws-border);
    transition: box-shadow 0.2s, transform 0.2s;
    display: block;
  }

  .ws-work-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }

  .ws-work-img {
    width: 100%;
    aspect-ratio: 3 / 2;
    object-fit: cover;
  }

  .ws-work-img-empty {
    width: 100%;
    aspect-ratio: 3 / 2;
    background: color-mix(in srgb, var(--ws-primary) 5%, var(--ws-bg));
  }

  .ws-work-info { padding: 16px; }

  .ws-work-name {
    font-family: var(--ws-heading-font);
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 4px;
  }

  .ws-work-desc {
    font-size: 14px;
    color: var(--ws-muted);
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .ws-work-meta {
    font-size: 12px;
    color: var(--ws-muted);
  }

  /* Articles */
  .ws-articles-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  @media (max-width: 768px) {
    .ws-articles-grid { grid-template-columns: 1fr; }
  }

  .ws-article-card {
    text-decoration: none;
    color: inherit;
    border-radius: var(--ws-radius);
    overflow: hidden;
    border: 1px solid var(--ws-border);
    transition: box-shadow 0.2s;
    display: block;
  }

  .ws-article-card:hover {
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }

  .ws-article-img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  .ws-article-info { padding: 14px; }

  .ws-article-title {
    font-family: var(--ws-heading-font);
    font-size: 15px;
    font-weight: 600;
    color: var(--ws-primary);
    line-height: 1.3;
    margin-bottom: 6px;
  }

  .ws-article-excerpt {
    font-size: 13px;
    color: var(--ws-muted);
    line-height: 1.5;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ws-article-date {
    font-size: 12px;
    color: var(--ws-muted);
  }
`;
