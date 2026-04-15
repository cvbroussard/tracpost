import type { PricingTier } from "@/lib/tenant-site";

interface Props {
  headline: string;
  subheadline?: string;
  tiers: PricingTier[];
}

/**
 * Work-slot variant: pricing_tiers
 * 3-tier card layout with per-tier CTA. For SaaS, coaches, productized
 * services. CTAs typically point at Stripe checkout (SaaS) or a
 * booking/contact link (services).
 */
export default function WorkPricingTiers({ headline, subheadline, tiers }: Props) {
  return (
    <>
      <section className="ws-work-hero">
        <div className="ws-container">
          <h1 className="ws-work-title">{headline}</h1>
          {subheadline && <p className="ws-work-subtitle">{subheadline}</p>}
        </div>
      </section>

      {tiers.length > 0 && (
        <section className="ws-section">
          <div className="ws-container">
            <div className="ws-tiers-grid">
              {tiers.map((tier, i) => (
                <div
                  key={i}
                  className={`ws-tier ${tier.highlight ? "ws-tier-highlight" : ""}`}
                >
                  <h3 className="ws-tier-title">{tier.title}</h3>
                  {tier.description && <p className="ws-tier-desc">{tier.description}</p>}
                  <p className="ws-tier-price">{tier.price}</p>
                  {tier.features.length > 0 && (
                    <ul className="ws-tier-features">
                      {tier.features.map((f, j) => (
                        <li key={j}>{f}</li>
                      ))}
                    </ul>
                  )}
                  <a
                    href={tier.cta.href}
                    className={`ws-btn ${tier.cta.style === "outline" ? "ws-btn-outline" : "ws-btn-primary"} ws-tier-cta`}
                    {...(tier.cta.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {tier.cta.label}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: tiersStyles }} />
    </>
  );
}

const tiersStyles = `
  .ws-work-hero { padding: 80px 0 40px; border-bottom: 1px solid var(--ws-border); }
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

  .ws-tiers-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    align-items: stretch;
  }
  @media (max-width: 768px) { .ws-tiers-grid { grid-template-columns: 1fr; } }

  .ws-tier {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    padding: 32px 28px;
    background: var(--ws-bg);
  }
  .ws-tier-highlight {
    border-color: var(--ws-accent);
    border-width: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    transform: scale(1.02);
  }
  @media (max-width: 768px) {
    .ws-tier-highlight { transform: none; }
  }

  .ws-tier-title {
    font-family: var(--ws-heading-font);
    font-size: 22px;
    font-weight: 700;
    color: var(--ws-primary);
    margin-bottom: 4px;
  }
  .ws-tier-desc {
    font-size: 13px;
    color: var(--ws-muted);
    margin-bottom: 20px;
  }
  .ws-tier-price {
    font-family: var(--ws-heading-font);
    font-size: 36px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.02em;
    margin-bottom: 24px;
  }
  .ws-tier-features {
    list-style: none;
    padding: 0;
    margin: 0 0 28px;
    font-size: 14px;
    color: var(--ws-text);
    flex: 1;
  }
  .ws-tier-features li {
    padding: 6px 0;
    border-bottom: 1px solid var(--ws-border);
  }
  .ws-tier-features li:last-child { border-bottom: none; }
  .ws-tier-features li::before {
    content: "✓ ";
    color: var(--ws-accent);
    font-weight: 700;
    margin-right: 6px;
  }
  .ws-tier-cta {
    text-align: center;
    width: 100%;
  }
`;
