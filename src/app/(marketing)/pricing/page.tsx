import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — TracPost",
  description: "Simple pricing for AI-powered content automation. Growth $99/mo, Authority $219/mo. 14-day free trial.",
};

const PLANS = [
  {
    name: "Growth",
    price: "$99",
    tagline: "Your content engine, running.",
    features: [
      "10 blog posts per month",
      "4 topic clusters",
      "5 personas (Cast of Characters)",
      "Monthly SEO audit",
      "1 site (channel)",
      "All 8 platforms",
      "AI brand playbook",
      "Autopilot publishing",
    ],
    cta: "Start 14-day trial",
    highlight: false,
  },
  {
    name: "Authority",
    price: "$219",
    tagline: "Own your category.",
    features: [
      "Unlimited blog posts",
      "All topic clusters",
      "Unlimited personas",
      "Weekly SEO audit",
      "Up to 5 sites (channels)",
      "All 8 platforms",
      "AI brand playbook",
      "Manual scheduling control",
      "Blog import with redirect preservation",
    ],
    cta: "Start 14-day trial",
    highlight: true,
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h1 className="mp-section-title" style={{ fontSize: 48 }}>Simple pricing</h1>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 16px" }}>
            Both plans include all 8 platforms, the mobile capture app, AI brand intelligence,
            and managed account setup. Start with a 14-day free trial.
          </p>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 48px", fontSize: 14 }}>
            No credit card required. Cancel anytime.
          </p>

          <div className="mp-pricing-grid">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`mp-plan-card ${plan.highlight ? "mp-plan-highlight" : ""}`}
              >
                <h2 className="mp-plan-name">{plan.name}</h2>
                <p className="mp-plan-tagline">{plan.tagline}</p>
                <p className="mp-plan-price">
                  <span className="mp-plan-amount">{plan.price}</span>
                  <span className="mp-plan-period">/month</span>
                </p>
                <ul className="mp-plan-features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className={plan.highlight ? "mp-btn-primary mp-btn-lg mp-plan-cta" : "mp-btn-outline mp-btn-lg mp-plan-cta"}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
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
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    max-width: 800px;
    margin: 0 auto;
  }
  @media (max-width: 640px) { .mp-pricing-grid { grid-template-columns: 1fr; } }

  .mp-plan-card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 40px 32px;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .mp-plan-highlight {
    border-color: #1a1a1a;
    border-width: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
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
    padding: 8px 0;
    font-size: 14px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
  }
  .mp-plan-features li:last-child { border-bottom: none; }
  .mp-plan-cta { width: 100%; text-align: center; }
`;
