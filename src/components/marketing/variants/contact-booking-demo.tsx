import type { ContactPageData, TenantContext } from "@/lib/tenant-site";

interface Props {
  data: ContactPageData;
  ctx: TenantContext;
}

/**
 * Contact-slot variant: booking_demo
 * SaaS-flavored contact page: the primary CTA is a demo booking or
 * email thread, not a local-phone contact form. Email + optional
 * booking link take precedence over phone/location.
 */
export default function ContactBookingDemo({ data, ctx }: Props) {
  const headline = data.headline || "Let's talk about your content pipeline";
  const subtitle =
    data.subtitle ||
    "Tell us a little about what you're working on and how many creators are on the team. We'll point you at the right plan or book a short call.";

  return (
    <>
      <section className="ws-booking-hero">
        <div className="ws-container ws-booking-inner">
          <h1 className="ws-booking-title">{headline}</h1>
          <p className="ws-booking-subtitle">{subtitle}</p>

          <div className="ws-booking-cta-row">
            {ctx.email && (
              <a href={`mailto:${ctx.email}`} className="ws-btn ws-btn-primary">
                Email us
              </a>
            )}
          </div>

          <div className="ws-booking-channels">
            {ctx.email && (
              <div className="ws-booking-channel">
                <span className="ws-booking-channel-label">Email</span>
                <a href={`mailto:${ctx.email}`} className="ws-booking-channel-value">
                  {ctx.email}
                </a>
              </div>
            )}
            {ctx.phone && (
              <div className="ws-booking-channel">
                <span className="ws-booking-channel-label">Phone</span>
                <a href={`tel:${ctx.phone}`} className="ws-booking-channel-value">
                  {ctx.phone}
                </a>
              </div>
            )}
            {ctx.location && (
              <div className="ws-booking-channel">
                <span className="ws-booking-channel-label">Based in</span>
                <span className="ws-booking-channel-value">{ctx.location}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: bookingStyles }} />
    </>
  );
}

const bookingStyles = `
  .ws-booking-hero {
    padding: 96px 0 80px;
  }
  .ws-booking-inner {
    max-width: 680px;
    margin: 0 auto;
    text-align: center;
  }
  .ws-booking-title {
    font-family: var(--ws-heading-font);
    font-size: 44px;
    font-weight: 700;
    color: var(--ws-primary);
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin-bottom: 20px;
  }
  @media (max-width: 768px) { .ws-booking-title { font-size: 32px; } }

  .ws-booking-subtitle {
    font-size: 18px;
    color: var(--ws-muted);
    line-height: 1.6;
    max-width: 540px;
    margin: 0 auto 40px;
  }

  .ws-booking-cta-row {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 56px;
  }

  .ws-booking-channels {
    display: flex;
    gap: 48px;
    justify-content: center;
    flex-wrap: wrap;
    padding-top: 40px;
    border-top: 1px solid var(--ws-border);
  }
  .ws-booking-channel {
    text-align: center;
  }
  .ws-booking-channel-label {
    display: block;
    font-size: 12px;
    color: var(--ws-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }
  .ws-booking-channel-value {
    font-size: 15px;
    color: var(--ws-primary);
    text-decoration: none;
    font-weight: 500;
  }
  a.ws-booking-channel-value:hover { color: var(--ws-accent); }
`;
