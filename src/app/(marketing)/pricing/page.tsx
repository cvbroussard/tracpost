import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { CheckoutButton } from "@/components/marketing-platform/checkout-button";

export const metadata: Metadata = {
  title: "Pricing — TracPost",
  description: "Simple pricing for AI-powered content automation. Growth $99/mo, Authority $219/mo. 7-day free trial.",
};

export const revalidate = 300;

export default async function PricingPage() {
  const products = await sql`
    SELECT id, name, tagline, price, frequency, features, cta_text, cta_href, highlight, sort_order, stripe_price_id
    FROM products
    WHERE is_active = true
    ORDER BY sort_order ASC
  `;

  return (
    <>
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h1 className="mp-section-title" style={{ fontSize: 48 }}>Simple pricing</h1>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 16px" }}>
            Both plans include all 8 platforms, the mobile capture app, AI brand intelligence,
            and managed account setup. Start with a 7-day free trial.
          </p>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 48px", fontSize: 14 }}>
            Try free for 7 days. Cancel anytime.
          </p>

          <div className="mp-pricing-grid">
            {products.map((plan) => {
              const allFeatures = (plan.features as Array<{ text: string; visible: boolean }>) || [];
              const features = allFeatures.filter(f => f.visible);
              const ctaHref = (plan.cta_href as string) || "/signup";
              const isHighlight = plan.highlight as boolean;

              return (
                <div
                  key={plan.name as string}
                  className={`mp-plan-card ${isHighlight ? "mp-plan-highlight" : ""}`}
                >
                  {isHighlight && (
                    <span className="mp-plan-badge">Most popular</span>
                  )}
                  <h2 className="mp-plan-name">{plan.name as string}</h2>
                  <p className="mp-plan-tagline">{plan.tagline as string}</p>
                  <p className="mp-plan-price">
                    <span className="mp-plan-amount">{plan.price as string}</span>
                    <span className="mp-plan-period">{plan.frequency as string}</span>
                  </p>
                  <ul className="mp-plan-features">
                    {features.map((f, i) => (
                      <li key={i}>{f.text}</li>
                    ))}
                  </ul>
                  {plan.stripe_price_id && !plan.cta_href ? (
                    <CheckoutButton
                      productId={plan.id as string}
                      label={plan.cta_text as string}
                      className={isHighlight ? "mp-btn-primary mp-btn-lg mp-plan-cta" : "mp-btn-outline mp-btn-lg mp-plan-cta"}
                    />
                  ) : (
                    <Link
                      href={ctaHref}
                      className={isHighlight ? "mp-btn-primary mp-btn-lg mp-plan-cta" : "mp-btn-outline mp-btn-lg mp-plan-cta"}
                    >
                      {plan.cta_text as string}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mp-section mp-section-alt">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">Not sure which plan?</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 32px" }}>
            Both plans use the same AI engine and publish to the same 8 platforms. The difference is
            content volume and how many sites you need. Most solo businesses start with Growth.
          </p>
          <Link href="/contact" className="mp-btn-outline mp-btn-lg">Talk to us</Link>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: pricingStyles }} />
    </>
  );
}

const pricingStyles = `
  .mp-pricing-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 900px) { .mp-pricing-grid { grid-template-columns: 1fr; } }

  .mp-plan-card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 40px 32px;
    text-align: left;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .mp-plan-highlight {
    border-color: #1a1a1a;
    border-width: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
  .mp-plan-badge {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a1a;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 16px;
    border-radius: 20px;
    white-space: nowrap;
  }
  .mp-plan-name {
    font-size: 24px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
  }
  .mp-plan-tagline {
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 24px;
  }
  .mp-plan-amount {
    font-size: 48px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
  }
  .mp-plan-period { font-size: 16px; color: #6b7280; }
  .mp-plan-price { margin-bottom: 32px; }
  .mp-plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 32px;
    flex: 1;
  }
  .mp-plan-features li {
    font-size: 14px;
    color: #374151;
    padding: 6px 0;
    border-bottom: 1px solid #f3f4f6;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .mp-plan-features li::before {
    content: "✓";
    color: #22c55e;
    font-weight: 600;
    flex-shrink: 0;
  }
  .mp-plan-features li:last-child { border-bottom: none; }
  .mp-plan-cta { display: block; text-align: center; width: 100%; }
`;
