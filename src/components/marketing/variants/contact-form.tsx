import type { ContactPageData, TenantContext } from "@/lib/tenant-site";

interface Props {
  data: ContactPageData;
  ctx: TenantContext;
}

/**
 * Contact-slot variant: form
 * Headline + email/phone/location. The default variant for service
 * businesses — contact details prominent, form wiring deferred to a
 * later phase (POST /api/website/contact).
 */
export default function ContactForm({ data, ctx }: Props) {
  return (
    <>
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
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: contactStyles }} />
    </>
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
