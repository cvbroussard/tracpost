import Image from "next/image";
import type { HomePageData } from "@/lib/tenant-site";

interface Props {
  data: HomePageData;
  prefix: string;
}

/**
 * Home-slot variant: service_business
 * Hero image + services grid + gallery + CTA. The default variant for
 * renovation, construction, design, and similar offline-work tenants.
 */
export default function HomeServiceBusiness({ data, prefix }: Props) {
  return (
    <>
      <section className="ws-hero">
        {data.heroImage && <Image src={data.heroImage} alt={data.heroTitle || ""} className="ws-hero-bg" width={1920} height={1080} priority sizes="100vw" quality={75} />}
        <div className="ws-hero-overlay">
          <div className="ws-container ws-hero-content">
            <h1 className="ws-hero-title">{data.heroTitle}</h1>
            <p className="ws-hero-subtitle">{data.heroSubtitle}</p>
            <div className="ws-hero-actions">
              <a href={`${prefix}/contact`} className="ws-btn ws-btn-primary">
                {data.ctaText}
              </a>
              <a
                href={`${prefix}/work`}
                className="ws-btn ws-btn-outline"
                style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
              >
                View Our Work
              </a>
            </div>
          </div>
        </div>
      </section>

      {data.services.length > 0 && (
        <section className="ws-section">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.servicesTitle}</h2>
            {data.servicesSubtitle && (
              <p className="ws-section-subtitle">{data.servicesSubtitle}</p>
            )}
            <div className="ws-services-grid">
              {data.services.map((service, i) => (
                <div key={i} className="ws-service-card">
                  {service.image && (
                    <Image src={service.image} alt={service.title} className="ws-service-img" width={640} height={360} sizes="(max-width: 768px) 100vw, 33vw" quality={75} />
                  )}
                  <h3 className="ws-service-name">{service.title}</h3>
                  <p className="ws-service-desc">{service.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data.galleryImages.length > 0 && (
        <section className="ws-section-alt">
          <div className="ws-container">
            <h2 className="ws-section-title">{data.galleryTitle}</h2>
            {data.gallerySubtitle && (
              <p className="ws-section-subtitle">{data.gallerySubtitle}</p>
            )}
            <div className="ws-gallery">
              {data.galleryImages.slice(0, 6).map((img, i) => (
                <a key={i} href={`${prefix}/work`} className="ws-gallery-item">
                  <Image src={img.url} alt={img.alt || ""} width={400} height={400} sizes="(max-width: 640px) 50vw, 33vw" quality={75} />
                </a>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <a href={`${prefix}/work`} className="ws-btn ws-btn-outline">
                See All Projects
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="ws-section ws-cta-section">
        <div className="ws-container" style={{ textAlign: "center" }}>
          <h2 className="ws-section-title" style={{ marginBottom: 16 }}>
            Ready to get started?
          </h2>
          <p className="ws-section-subtitle" style={{ margin: "0 auto 32px", maxWidth: 500 }}>
            Tell us about your project — we&apos;ll walk through what&apos;s involved and give you a clear picture of what to expect.
          </p>
          <a href={`${prefix}/contact`} className="ws-btn ws-btn-primary">
            Contact Us
          </a>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: serviceBusinessStyles }} />
    </>
  );
}

const serviceBusinessStyles = `
  .ws-hero {
    position: relative;
    min-height: 80vh;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    background: var(--ws-primary);
  }
  .ws-hero-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 0;
  }
  .ws-hero-overlay {
    position: relative;
    z-index: 1;
    width: 100%;
    padding: 120px 0 80px;
    background: linear-gradient(transparent 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.8) 100%);
  }
  .ws-hero-content { max-width: 680px; }
  .ws-hero-title {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: #fff;
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin-bottom: 16px;
  }
  .ws-hero-subtitle {
    font-size: 19px;
    color: rgba(255,255,255,0.85);
    line-height: 1.6;
    margin-bottom: 32px;
    max-width: 560px;
  }
  .ws-hero-actions { display: flex; gap: 16px; flex-wrap: wrap; }
  @media (max-width: 768px) {
    .ws-hero { min-height: 60vh; }
    .ws-hero-title { font-size: 32px; }
    .ws-hero-subtitle { font-size: 16px; }
    .ws-hero-overlay { padding: 80px 0 48px; }
  }

  .ws-services-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 768px) { .ws-services-grid { grid-template-columns: 1fr; } }
  .ws-service-card {
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .ws-service-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }
  .ws-service-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .ws-service-name {
    font-family: var(--ws-heading-font);
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    padding: 16px 16px 4px;
  }
  .ws-service-desc {
    font-size: 14px;
    color: var(--ws-muted);
    padding: 0 16px 16px;
    line-height: 1.6;
  }

  .ws-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 640px) { .ws-gallery { grid-template-columns: repeat(2, 1fr); } }
  .ws-gallery-item {
    border-radius: var(--ws-radius);
    overflow: hidden;
    display: block;
  }
  .ws-gallery-item img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    transition: transform 0.3s;
  }
  .ws-gallery-item:hover img { transform: scale(1.05); }

  .ws-cta-section { border-top: 1px solid var(--ws-border); }
`;
