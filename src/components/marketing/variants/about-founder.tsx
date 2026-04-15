import type { AboutPageData } from "@/lib/tenant-site";

interface Props {
  data: AboutPageData;
  prefix: string;
}

/**
 * About-slot variant: founder
 * Founder-first narrative for SaaS tenants. "Why I built this" angle,
 * with optional portrait and principles. Story HTML + values double
 * as the long-form body + principle list.
 */
export default function AboutFounder({ data, prefix }: Props) {
  const headline = data.headline || "Built by people who got tired of doing it the old way";

  return (
    <>
      <section className="ws-founder-hero">
        <div className="ws-container ws-founder-hero-inner">
          <h1 className="ws-founder-title">{headline}</h1>
          {data.stats.length > 0 && (
            <div className="ws-founder-stats">
              {data.stats.slice(0, 3).map((s, i) => (
                <div key={i}>
                  <span className="ws-founder-stat-value">{s.value}</span>
                  <span className="ws-founder-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {data.story ? (
        <section className="ws-section">
          <div className="ws-container">
            <div className="ws-founder-body">
              {data.aboutHero && (
                <img src={data.aboutHero} alt="" className="ws-founder-portrait" />
              )}
              <div
                className="ws-founder-story"
                dangerouslySetInnerHTML={{ __html: data.story }}
              />
            </div>
          </div>
        </section>
      ) : (
        <section className="ws-section">
          <div className="ws-container">
            <div className="ws-founder-body">
              <div className="ws-founder-story">
                <p>
                  This started as a side project — a way to stop spending weekends writing
                  captions and blog posts that nobody saw. Turns out we weren&apos;t the only
                  ones tired of it.
                </p>
                <p>
                  Now it&apos;s a platform. The content engine publishes for us the same way
                  it publishes for everyone else using it. Every page on this site, every
                  blog article, every social post — ran through the same pipeline our
                  customers use. We eat our own cooking.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {data.values.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <h2 className="ws-founder-section-title">Principles</h2>
            <div className="ws-founder-principles">
              {data.values.map((v, i) => (
                <div key={i} className="ws-founder-principle">
                  <h3 className="ws-founder-principle-title">{v.title}</h3>
                  <p className="ws-founder-principle-body">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="ws-section">
        <div className="ws-container" style={{ textAlign: "center" }}>
          <h2 className="ws-founder-section-title" style={{ marginBottom: 16 }}>
            Want to see how it runs?
          </h2>
          <p style={{ maxWidth: 540, margin: "0 auto 32px", color: "var(--ws-muted)", fontSize: 17, lineHeight: 1.6 }}>
            Every case study you&apos;ll find on the blog was published by the system itself.
            Try it free for 14 days — no credit card.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={`${prefix}/work`} className="ws-btn ws-btn-primary">
              See pricing
            </a>
            <a href={`${prefix}/contact`} className="ws-btn ws-btn-outline">
              Talk to us
            </a>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: founderStyles }} />
    </>
  );
}

const founderStyles = `
  .ws-founder-hero {
    padding: 96px 0 64px;
    text-align: center;
    border-bottom: 1px solid var(--ws-border);
  }
  .ws-founder-hero-inner { max-width: 780px; margin: 0 auto; }
  .ws-founder-title {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: var(--ws-primary);
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin-bottom: 40px;
  }
  @media (max-width: 768px) { .ws-founder-title { font-size: 32px; } }

  .ws-founder-stats {
    display: flex;
    gap: 48px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .ws-founder-stat-value {
    display: block;
    font-family: var(--ws-heading-font);
    font-size: 36px;
    font-weight: 700;
    color: var(--ws-accent);
    letter-spacing: -0.02em;
  }
  .ws-founder-stat-label {
    display: block;
    font-size: 13px;
    color: var(--ws-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }

  .ws-founder-body {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 48px;
    max-width: 900px;
    margin: 0 auto;
    align-items: start;
  }
  @media (max-width: 768px) {
    .ws-founder-body { grid-template-columns: 1fr; gap: 24px; }
  }
  .ws-founder-portrait {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--ws-radius);
  }
  .ws-founder-story {
    font-size: 17px;
    line-height: 1.8;
    color: var(--ws-text);
  }
  .ws-founder-story p { margin-bottom: 1.4em; }

  .ws-founder-section-title {
    font-family: var(--ws-heading-font);
    font-size: 28px;
    font-weight: 600;
    color: var(--ws-primary);
    text-align: center;
    margin-bottom: 40px;
    letter-spacing: -0.02em;
  }

  .ws-founder-principles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) { .ws-founder-principles { grid-template-columns: 1fr; } }
  .ws-founder-principle-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }
  .ws-founder-principle-body { color: var(--ws-muted); line-height: 1.6; font-size: 15px; }
`;
