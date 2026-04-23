import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { CheckoutButton } from "@/components/marketing-platform/checkout-button";

export const metadata: Metadata = {
  title: "Compare Plans — TracPost",
  description: "Side-by-side comparison of TracPost plans. See every feature across Growth, Authority, and Enterprise.",
};

export const revalidate = 300;

interface Feature {
  text: string;
  visible: boolean;
}

export default async function ComparePage() {
  const products = await sql`
    SELECT id, name, tagline, price, frequency, features, cta_text, cta_href, highlight, stripe_price_id
    FROM products
    WHERE is_active = true
    ORDER BY sort_order ASC
  `;

  // Build a unified feature list — all unique feature texts across all plans
  const featureSet = new Map<string, Record<string, boolean>>();
  const planNames = products.map(p => p.name as string);

  for (const plan of products) {
    const features = (plan.features as Feature[]) || [];
    for (const f of features) {
      if (!featureSet.has(f.text)) {
        featureSet.set(f.text, {});
      }
      featureSet.get(f.text)![plan.name as string] = true;
    }
  }

  // Group features by category
  const categories = [
    {
      label: "Content Engine",
      features: [
        "AI-written captions and hashtags",
        "AI brand playbook",
        "Content corrections (tenant feedback loop)",
        "Project case study generation",
        "Autopilot publishing",
        "Manual scheduling control",
        "Video content generation (Kling)",
        "Adaptive quality thresholds",
      ],
    },
    {
      label: "Publishing",
      features: [
        "All 8 platforms",
        "Google Business Profile posting",
        "Hosted website (home, about, work, blog, projects, contact)",
        "Hosted website per client",
        "Custom domain support",
        "Blog import with redirect preservation",
        "Sitemap + structured data (JSON-LD)",
        "UTM tracking across all published links",
      ],
    },
    {
      label: "Content Volume",
      features: [
        "10 blog posts per month",
        "Unlimited blog posts",
        "4 topic clusters",
        "All topic clusters",
        "5 personas (Cast of Characters)",
        "Unlimited personas",
      ],
    },
    {
      label: "Sites & Channels",
      features: [
        "1 site (channel)",
        "Up to 5 sites (channels)",
        "Unlimited sites (channels)",
        "Multi-brand management",
        "Dedicated brand playbook per client",
      ],
    },
    {
      label: "SEO & Analytics",
      features: [
        "Monthly SEO audit",
        "Weekly SEO audit",
        "GA4 analytics integration",
        "Search Console integration",
        "PageSpeed monitoring",
      ],
    },
    {
      label: "Engagement",
      features: [
        "Review solicitation with QR code",
        "Spotlight (in-store social proof kiosk)",
        "Campaign management (ad platforms)",
      ],
    },
    {
      label: "Platform & Support",
      features: [
        "Mobile capture app",
        "HEIC auto-conversion",
        "Email support",
        "Priority email support",
        "Priority support + SLA",
        "Agency dashboard",
        "Custom integrations",
        "SSO / team access controls",
        "Dedicated account manager",
        "White-label option",
        "Dedicated Slack channel",
      ],
    },
  ];

  return (
    <>
      <section className="cp-hero">
        <div className="mp-container mp-text-center">
          <h1 className="cp-title">Compare plans</h1>
          <p className="cp-subtitle">
            Every plan includes the AI content engine, all 8 platforms, and a hosted website.
            The difference is volume, sites, and how hands-on you want to be.
          </p>
        </div>
      </section>

      <section className="mp-section">
        <div className="mp-container">
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th className="cp-feature-col"></th>
                  {products.map(p => (
                    <th key={p.name as string} className={`cp-plan-col ${p.highlight ? "cp-plan-highlight" : ""}`}>
                      <div className="cp-plan-header">
                        <span className="cp-plan-name">{p.name as string}</span>
                        <span className="cp-plan-price">{p.price as string}<span className="cp-plan-freq">{p.frequency as string}</span></span>
                        <span className="cp-plan-tagline">{p.tagline as string}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const relevantFeatures = cat.features.filter(f => featureSet.has(f));
                  if (relevantFeatures.length === 0) return null;

                  return [
                    <tr key={`cat-${cat.label}`} className="cp-category-row">
                      <td colSpan={planNames.length + 1} className="cp-category-label">{cat.label}</td>
                    </tr>,
                    ...relevantFeatures.map(featureText => {
                      const planMap = featureSet.get(featureText) || {};
                      return (
                        <tr key={featureText} className="cp-feature-row">
                          <td className="cp-feature-name">{featureText}</td>
                          {planNames.map(name => (
                            <td key={name} className="cp-check-cell">
                              {planMap[name] ? (
                                <span className="cp-check">✓</span>
                              ) : (
                                <span className="cp-dash">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  {products.map(p => (
                    <td key={p.name as string} className="cp-cta-cell">
                      {p.stripe_price_id && !p.cta_href ? (
                        <CheckoutButton
                          productId={p.id as string}
                          label={p.cta_text as string}
                          className="mp-btn-primary mp-btn-sm"
                        />
                      ) : (
                        <Link href={(p.cta_href as string) || "/contact"} className="mp-btn-outline mp-btn-sm">
                          {p.cta_text as string}
                        </Link>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <section className="mp-section mp-section-alt">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">Still have questions?</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 32px" }}>
            We&apos;ll walk you through which plan fits your business and how the onboarding works.
          </p>
          <Link href="/contact" className="mp-btn-outline mp-btn-lg">Talk to us</Link>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: compareStyles }} />
    </>
  );
}

const compareStyles = `
  .cp-hero { padding: 64px 0 0; }
  .cp-title {
    font-size: 40px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }
  .cp-subtitle {
    font-size: 17px;
    color: #6b7280;
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .cp-table-wrap { overflow-x: auto; }
  .cp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .cp-feature-col { width: 40%; text-align: left; }
  .cp-plan-col {
    width: 20%;
    text-align: center;
    padding: 0 16px;
    vertical-align: top;
  }
  .cp-plan-highlight { background: rgba(26, 26, 26, 0.02); }

  .cp-plan-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 24px 0 20px;
  }
  .cp-plan-name {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .cp-plan-price {
    font-size: 28px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
  }
  .cp-plan-freq { font-size: 14px; font-weight: 400; color: #6b7280; }
  .cp-plan-tagline {
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
  }

  .cp-category-row td {
    padding: 20px 0 8px;
    border-bottom: 2px solid #1a1a1a;
  }
  .cp-category-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #1a1a1a;
  }

  .cp-feature-row td {
    padding: 10px 0;
    border-bottom: 1px solid #f3f4f6;
  }
  .cp-feature-row:last-child td { border-bottom: none; }
  .cp-feature-name {
    color: #374151;
    padding-right: 16px;
  }
  .cp-check-cell { text-align: center; }
  .cp-check { color: #22c55e; font-weight: 600; font-size: 16px; }
  .cp-dash { color: #d1d5db; }

  .cp-cta-cell {
    padding: 24px 0;
    text-align: center;
  }

  .mp-btn-sm {
    display: inline-block;
    padding: 10px 24px;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    border-radius: 6px;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .cp-table { font-size: 12px; }
    .cp-plan-name { font-size: 16px; }
    .cp-plan-price { font-size: 22px; }
  }
`;
