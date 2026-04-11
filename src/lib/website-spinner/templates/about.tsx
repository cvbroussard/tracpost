import React from "react";

export interface AboutPageData {
  heroImage?: string;
  headline: string;
  story: string;          // 2-3 paragraphs, AI-generated from playbook
  values: Array<{ title: string; description: string }>;
  stats?: Array<{ value: string; label: string }>;
  teamTitle?: string;
  team?: Array<{ name: string; role: string }>;
  brandsTitle: string;
  brands: Array<{ name: string; slug: string }>;
  brandsUrl: string;
}

export default function AboutPage({ data }: { data: AboutPageData }) {
  return (
    <>
      {/* Hero */}
      {data.heroImage && (
        <div className="ws-about-hero">
          <img src={data.heroImage} alt="" className="ws-about-hero-img" />
        </div>
      )}

      {/* Story */}
      <section className="ws-section">
        <div className="ws-container ws-about-content">
          <h1 className="ws-section-title">{data.headline}</h1>
          <div className="ws-about-story" dangerouslySetInnerHTML={{ __html: data.story }} />
        </div>
      </section>

      {/* Stats */}
      {data.stats && data.stats.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <div className="ws-stats-grid">
              {data.stats.map((stat, i) => (
                <div key={i} className="ws-stat">
                  <span className="ws-stat-value">{stat.value}</span>
                  <span className="ws-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Values */}
      <section className={data.stats && data.stats.length > 0 ? "ws-section" : "ws-section-alt"}>
        <div className="ws-container">
          <h2 className="ws-section-title">What Sets Us Apart</h2>
          <div className="ws-values-grid">
            {data.values.map((value, i) => (
              <div key={i} className="ws-value-card">
                <div className="ws-value-number">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="ws-value-title">{value.title}</h3>
                <p className="ws-value-desc">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      {data.team && data.team.length > 0 && (
        <section className="ws-section">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.teamTitle || "Our Team"}</h2>
            <div className="ws-team-grid">
              {data.team.map((member, i) => (
                <div key={i} className="ws-team-card">
                  <span className="ws-team-name">{member.name}</span>
                  <span className="ws-team-role">{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Brands */}
      {data.brands.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.brandsTitle}</h2>
            <div className="ws-brands-grid">
              {data.brands.map((brand) => (
                <a key={brand.slug} href={`${data.brandsUrl}/${brand.slug}`} className="ws-brand-chip">
                  {brand.name}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: aboutStyles }} />
    </>
  );
}

const aboutStyles = `
  .ws-about-hero {
    width: 100%;
    overflow: hidden;
  }

  .ws-about-hero-img {
    width: 100%;
    max-height: 400px;
    object-fit: cover;
  }

  .ws-about-content {
    max-width: 720px;
  }

  .ws-about-story {
    font-size: 17px;
    line-height: 1.75;
    color: var(--ws-text);
  }

  .ws-about-story p {
    margin-bottom: 1.25em;
  }

  /* Stats */
  .ws-stats-grid {
    display: flex;
    justify-content: center;
    gap: 64px;
    flex-wrap: wrap;
  }

  .ws-stat {
    text-align: center;
  }

  .ws-stat-value {
    display: block;
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: var(--ws-accent);
    letter-spacing: -0.02em;
  }

  .ws-stat-label {
    display: block;
    font-size: 14px;
    color: var(--ws-muted);
    margin-top: 4px;
  }

  /* Values */
  .ws-values-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
  }

  @media (max-width: 768px) {
    .ws-values-grid { grid-template-columns: 1fr; }
  }

  .ws-value-card {
    padding: 24px;
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
  }

  .ws-value-number {
    font-family: var(--ws-heading-font);
    font-size: 32px;
    font-weight: 700;
    color: var(--ws-accent);
    opacity: 0.4;
    margin-bottom: 12px;
  }

  .ws-value-title {
    font-family: var(--ws-heading-font);
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }

  .ws-value-desc {
    font-size: 14px;
    color: var(--ws-muted);
    line-height: 1.6;
  }

  /* Team */
  .ws-team-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .ws-team-card {
    padding: 12px 20px;
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
  }

  .ws-team-name {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--ws-primary);
  }

  .ws-team-role {
    display: block;
    font-size: 12px;
    color: var(--ws-muted);
    text-transform: capitalize;
    margin-top: 2px;
  }

  /* Brands */
  .ws-brands-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .ws-brand-chip {
    font-size: 14px;
    padding: 8px 16px;
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    color: var(--ws-text);
    text-decoration: none;
    transition: all 0.15s;
  }

  .ws-brand-chip:hover {
    border-color: var(--ws-accent);
    color: var(--ws-accent);
  }
`;
