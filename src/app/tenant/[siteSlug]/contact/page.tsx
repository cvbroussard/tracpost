import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadTenantContext, loadContactPage, loadPageMetadata, slotByKey } from "@/lib/tenant-site";
import MarketingShell from "@/components/marketing/marketing-shell";

export const revalidate = 3600;

interface Props {
  params: Promise<{ siteSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) return {};
  const meta = await loadPageMetadata(ctx.siteId, "contact");
  return {
    title: meta.title,
    description: meta.description,
    ...(ctx.faviconUrl ? { icons: { icon: ctx.faviconUrl } } : {}),
  };
}

export default async function TenantContactPage({ params }: Props) {
  const { siteSlug } = await params;
  const ctx = await loadTenantContext(siteSlug);
  if (!ctx) notFound();
  if (!slotByKey(ctx.pageConfig, "contact").enabled) notFound();

  const data = await loadContactPage(ctx.siteId);

  return (
    <MarketingShell ctx={ctx} activePage="contact">
      <section className="ws-section">
        <div className="ws-container">
          <div className="ws-contact-wrapper">
            <h1 className="ws-contact-title">{data.headline}</h1>
            <p className="ws-contact-subtitle">{data.subtitle}</p>

            <div className="ws-contact-details">
              {ctx.email && (
                <div className="ws-contact-item">
                  <span className="ws-contact-label">Email</span>
                  <a href={`mailto:${ctx.email}`} className="ws-contact-value">
                    {ctx.email}
                  </a>
                </div>
              )}
              {ctx.phone && (
                <div className="ws-contact-item">
                  <span className="ws-contact-label">Phone</span>
                  <a href={`tel:${ctx.phone}`} className="ws-contact-value">
                    {ctx.phone}
                  </a>
                </div>
              )}
              {ctx.location && (
                <div className="ws-contact-item">
                  <span className="ws-contact-label">Location</span>
                  <span className="ws-contact-value">{ctx.location}</span>
                </div>
              )}
            </div>

            {/* Contact form would live here — wired to /api/website/contact in a later phase */}
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: contactStyles }} />
    </MarketingShell>
  );
}

const contactStyles = `
  .ws-contact-wrapper {
    max-width: 640px;
    margin: 0 auto;
    padding: 64px 0;
  }
  .ws-contact-title {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.03em;
    margin-bottom: 16px;
  }
  .ws-contact-subtitle {
    font-size: 17px;
    color: var(--ws-muted);
    line-height: 1.6;
    margin-bottom: 48px;
  }
  .ws-contact-details {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .ws-contact-item {
    padding: 16px 0;
    border-bottom: 1px solid var(--ws-border);
  }
  .ws-contact-item:last-child { border-bottom: none; }
  .ws-contact-label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ws-muted);
    margin-bottom: 6px;
  }
  .ws-contact-value {
    font-size: 20px;
    color: var(--ws-primary);
    text-decoration: none;
  }
  a.ws-contact-value:hover { color: var(--ws-accent); }
`;
