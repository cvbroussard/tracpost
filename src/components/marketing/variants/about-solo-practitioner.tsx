import Image from "next/image";
import type { AboutPageData } from "@/lib/tenant-site";
import { brandUrl } from "@/lib/urls";

interface Props {
  data: AboutPageData;
  siteSlug: string;
  customDomain: string | null;
}

/**
 * About-slot variant: solo_practitioner
 * Hero + story + stats + values + brands. The default variant used
 * for service-business tenants with a single owner/operator voice.
 * Works equally well as team/studio/firm until those variants ship.
 */
export default function AboutSoloPractitioner({ data, siteSlug, customDomain }: Props) {
  return (
    <>
      <section className="ws-about-hero">
        {data.aboutHero && <Image src={data.aboutHero} alt="About" className="ws-about-hero-bg" width={1920} height={1080} priority sizes="100vw" quality={75} />}
        <div className="ws-about-hero-overlay">
          <div className="ws-container">
            <h1 className="ws-about-title">{data.headline}</h1>
          </div>
        </div>
      </section>

      {data.story && (
        <section className="ws-section">
          <div className="ws-container">
            <div className="ws-story" dangerouslySetInnerHTML={{ __html: data.story }} />
          </div>
        </section>
      )}

      {data.stats.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <div className="ws-stats">
              {data.stats.map((s, i) => (
                <div key={i} className="ws-stat">
                  <div className="ws-stat-value">{s.value}</div>
                  <div className="ws-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data.values.length > 0 && (
        <section className="ws-section">
          <div className="ws-container">
            <h2 className="ws-section-title">What We Value</h2>
            <div className="ws-values-grid">
              {data.values.map((v, i) => (
                <div key={i} className="ws-value-card">
                  <h3 className="ws-value-title">{v.title}</h3>
                  <p className="ws-value-desc">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data.brands.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.brandsTitle}</h2>
            <div className="ws-brand-grid">
              {data.brands.map((b) => (
                <a
                  key={b.slug}
                  href={brandUrl(siteSlug, b.slug, customDomain)}
                  className="ws-brand-chip"
                >
                  {b.name}
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
    position: relative;
    min-height: 40vh;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    background: var(--ws-primary);
  }
  .ws-about-hero-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 0;
    opacity: 0.8;
  }
  .ws-about-hero-overlay {
    position: relative;
    z-index: 1;
    width: 100%;
    padding: 80px 0 48px;
    background: linear-gradient(transparent, rgba(0,0,0,0.6));
  }
  .ws-about-title {
    font-family: var(--ws-heading-font);
    font-size: 56px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.03em;
  }
  @media (max-width: 768px) { .ws-about-title { font-size: 36px; } }

  .ws-story {
    max-width: 720px;
    margin: 0 auto;
    font-size: 17px;
    line-height: 1.8;
    color: var(--ws-text);
  }
  .ws-story p { margin-bottom: 1.4em; }

  .ws-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    text-align: center;
  }
  @media (max-width: 640px) { .ws-stats { grid-template-columns: 1fr; } }
  .ws-stat-value {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: var(--ws-accent);
    letter-spacing: -0.02em;
  }
  .ws-stat-label {
    font-size: 14px;
    color: var(--ws-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ws-values-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 768px) { .ws-values-grid { grid-template-columns: 1fr; } }
  .ws-value-card { padding: 24px 0; }
  .ws-value-title {
    font-family: var(--ws-heading-font);
    font-size: 20px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }
  .ws-value-desc { font-size: 15px; color: var(--ws-muted); line-height: 1.6; }

  .ws-brand-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .ws-brand-chip {
    font-size: 14px;
    padding: 8px 18px;
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
