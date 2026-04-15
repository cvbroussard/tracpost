import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadTenantContext } from "@/lib/tenant-site";
import { detectHostMode } from "@/lib/urls";
import { sql } from "@/lib/db";
import MarketingShell from "@/components/marketing/marketing-shell";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string; serviceSlug: string }>;
}

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  priceRange: string | null;
  duration: string | null;
  heroUrl: string | null;
  gbpCategories: Array<{ gcid: string; name: string; isPrimary: boolean }>;
}

async function loadService(siteId: string, slug: string): Promise<ServiceRow | null> {
  const [row] = await sql`
    SELECT s.id, s.name, s.description, s.price_range, s.duration,
           ma.storage_url AS hero_url
    FROM services s
    LEFT JOIN media_assets ma ON ma.id = s.hero_asset_id
    WHERE s.site_id = ${siteId} AND s.slug = ${slug}
  `;
  if (!row) return null;

  const cats = await sql`
    SELECT sgc.gcid, sgc.is_primary, gc.name
    FROM service_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.service_id = ${row.id}
    ORDER BY sgc.is_primary DESC
  `;

  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    priceRange: row.price_range ? String(row.price_range) : null,
    duration: row.duration ? String(row.duration) : null,
    heroUrl: row.hero_url ? String(row.hero_url) : null,
    gbpCategories: cats.map((c) => ({
      gcid: String(c.gcid),
      name: String(c.name),
      isPrimary: Boolean(c.is_primary),
    })),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug, serviceSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const service = await loadService(ctx.siteId, serviceSlug);
  if (!service) return {};
  const primaryCat = service.gbpCategories.find((c) => c.isPrimary);
  const title = `${service.name} — ${ctx.siteName}${ctx.location ? ` · ${ctx.location}` : ""}`;
  const description =
    service.description ||
    `${service.name}${primaryCat ? ` (${primaryCat.name.toLowerCase()})` : ""}${ctx.location ? ` in ${ctx.location}` : ""}`;
  return {
    title,
    description,
    ...(ctx.faviconUrl ? { icons: { icon: ctx.faviconUrl } } : {}),
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { siteSlug, serviceSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();

  const service = await loadService(ctx.siteId, serviceSlug);
  if (!service) notFound();

  const hostMode = await detectHostMode();
  const prefix = hostMode === "preview" ? `/${ctx.siteSlug}` : "";

  // Related assets tagged to this service
  const gallery = await sql`
    SELECT ma.storage_url, ma.context_note
    FROM asset_services asv
    JOIN media_assets ma ON ma.id = asv.asset_id
    WHERE asv.service_id = ${service.id}
      AND ma.triage_status = 'triaged'
      AND ma.media_type LIKE 'image%'
    ORDER BY ma.quality_score DESC NULLS LAST
    LIMIT 12
  `;

  // Related blog posts — via source_asset_id → asset_services
  const posts = await sql`
    SELECT DISTINCT bp.slug, bp.title, bp.excerpt, bp.og_image_url, bp.published_at
    FROM blog_posts bp
    JOIN asset_services asv ON asv.asset_id = bp.source_asset_id
    WHERE asv.service_id = ${service.id}
      AND bp.status = 'published'
      AND bp.site_id = ${ctx.siteId}
    ORDER BY bp.published_at DESC NULLS LAST
    LIMIT 3
  `;

  const primaryCat = service.gbpCategories.find((c) => c.isPrimary);

  // Schema.org Service JSON-LD — ties the tenant-facing copy to the
  // gcid via a canonical LocalBusiness service type for local SEO.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.description || undefined,
    serviceType: primaryCat?.name,
    provider: {
      "@type": "LocalBusiness",
      name: ctx.siteName,
      ...(ctx.location ? { address: { "@type": "PostalAddress", addressLocality: ctx.location } } : {}),
      ...(ctx.phone ? { telephone: ctx.phone } : {}),
      ...(ctx.email ? { email: ctx.email } : {}),
      ...(ctx.websiteUrl ? { url: ctx.websiteUrl } : {}),
    },
    ...(service.priceRange ? { offers: { "@type": "Offer", priceSpecification: service.priceRange } } : {}),
  };

  return (
    <MarketingShell ctx={ctx} activePage="work">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="ws-svc-hero">
        {service.heroUrl && <img src={service.heroUrl} alt="" className="ws-svc-hero-bg" />}
        <div className="ws-svc-hero-overlay">
          <div className="ws-container">
            <p className="ws-svc-crumb">
              <a href={`${prefix}/work`}>Services</a> · <span>{service.name}</span>
            </p>
            <h1 className="ws-svc-title">{service.name}</h1>
            {service.description && <p className="ws-svc-lede">{service.description}</p>}
          </div>
        </div>
      </section>

      <section className="ws-section">
        <div className="ws-container ws-svc-body">
          <aside className="ws-svc-meta">
            {service.priceRange && (
              <div>
                <span className="ws-svc-meta-label">Price</span>
                <span className="ws-svc-meta-value">{service.priceRange}</span>
              </div>
            )}
            {service.duration && (
              <div>
                <span className="ws-svc-meta-label">Typical timeline</span>
                <span className="ws-svc-meta-value">{service.duration}</span>
              </div>
            )}
            <div>
              <span className="ws-svc-meta-label">Category</span>
              <span className="ws-svc-meta-value">
                {primaryCat?.name || service.gbpCategories[0]?.name || "Local business"}
              </span>
            </div>
            <a href={`${prefix}/contact`} className="ws-btn ws-btn-primary ws-svc-cta">
              Request a quote
            </a>
          </aside>

          <div className="ws-svc-main">
            {gallery.length > 0 && (
              <div className="ws-svc-gallery">
                {gallery.slice(0, 6).map((g, i) => (
                  <img
                    key={i}
                    src={String(g.storage_url)}
                    alt={g.context_note ? String(g.context_note).slice(0, 80) : service.name}
                  />
                ))}
              </div>
            )}

            {posts.length > 0 && (
              <div className="ws-svc-posts">
                <h2 className="ws-svc-posts-title">Related posts</h2>
                <ul>
                  {posts.map((p) => (
                    <li key={String(p.slug)}>
                      <a href={`${prefix}/blog/${String(p.slug)}`}>{String(p.title)}</a>
                      {p.excerpt && <p>{String(p.excerpt)}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: svcStyles }} />
    </MarketingShell>
  );
}

const svcStyles = `
  .ws-svc-hero {
    position: relative;
    min-height: 40vh;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    background: var(--ws-primary);
  }
  .ws-svc-hero-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.6;
  }
  .ws-svc-hero-overlay {
    position: relative;
    z-index: 1;
    width: 100%;
    padding: 80px 0 56px;
    background: linear-gradient(transparent, rgba(0,0,0,0.72));
  }
  .ws-svc-crumb {
    font-size: 13px;
    color: rgba(255,255,255,0.75);
    margin-bottom: 12px;
  }
  .ws-svc-crumb a { color: rgba(255,255,255,0.85); text-decoration: none; }
  .ws-svc-crumb a:hover { color: #fff; }
  .ws-svc-title {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.03em;
    margin-bottom: 16px;
  }
  .ws-svc-lede {
    font-size: 19px;
    color: rgba(255,255,255,0.85);
    line-height: 1.6;
    max-width: 640px;
  }
  @media (max-width: 768px) {
    .ws-svc-title { font-size: 32px; }
    .ws-svc-lede { font-size: 16px; }
  }

  .ws-svc-body {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 48px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .ws-svc-body { grid-template-columns: 1fr; gap: 32px; }
  }

  .ws-svc-meta {
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: sticky;
    top: 96px;
  }
  .ws-svc-meta > div { display: flex; flex-direction: column; gap: 2px; }
  .ws-svc-meta-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ws-muted);
  }
  .ws-svc-meta-value {
    font-size: 15px;
    font-weight: 500;
    color: var(--ws-primary);
  }
  .ws-svc-cta { width: 100%; text-align: center; margin-top: 8px; }

  .ws-svc-gallery {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 48px;
  }
  @media (max-width: 640px) { .ws-svc-gallery { grid-template-columns: repeat(2, 1fr); } }
  .ws-svc-gallery img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: calc(var(--ws-radius) / 2);
  }

  .ws-svc-posts-title {
    font-family: var(--ws-heading-font);
    font-size: 22px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 16px;
  }
  .ws-svc-posts ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
  .ws-svc-posts li { padding: 12px 0; border-bottom: 1px solid var(--ws-border); }
  .ws-svc-posts li:last-child { border-bottom: none; }
  .ws-svc-posts a {
    font-size: 16px;
    font-weight: 600;
    color: var(--ws-primary);
    text-decoration: none;
  }
  .ws-svc-posts a:hover { color: var(--ws-accent); }
  .ws-svc-posts p { font-size: 14px; color: var(--ws-muted); margin-top: 4px; line-height: 1.5; }
`;
