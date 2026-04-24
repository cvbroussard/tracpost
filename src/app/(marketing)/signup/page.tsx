import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Start your trial — TracPost",
  description: "Set up your AI-powered content engine in minutes. 7-day free trial, cancel anytime.",
};

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ plan?: string; subscribe?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const planName = params.plan || "growth";
  const skipTrial = params.subscribe === "true";

  const [product] = await sql`
    SELECT id, name, tagline, price, frequency, features, trial_days, stripe_price_id
    FROM products
    WHERE LOWER(name) = ${planName.toLowerCase()} AND is_active = true
  `;

  if (!product) notFound();

  const features = (product.features as Array<{ text: string; visible: boolean }>)
    .filter(f => f.visible)
    .slice(0, 6);

  return (
    <section className="su-page">
      <div className="mp-container su-grid">
        {/* Left: form */}
        <div className="su-form-col">
          <h1 className="su-title">
            {skipTrial ? `Subscribe to ${product.name}` : `Start your ${product.trial_days}-day free trial`}
          </h1>
          <p className="su-subtitle">
            {skipTrial
              ? `${product.price}${product.frequency} — billed immediately. Cancel anytime.`
              : `Try ${product.name} free for ${product.trial_days} days. No charge until your trial ends.`
            }
          </p>

          <SignupForm
            productId={product.id as string}
            productName={product.name as string}
            skipTrial={skipTrial}
          />

          <p className="su-legal">
            By continuing, you agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>

        {/* Right: plan summary */}
        <div className="su-summary-col">
          <div className="su-plan-card">
            <span className="su-plan-badge">{skipTrial ? "Subscribe" : "7-day free trial"}</span>
            <h2 className="su-plan-name">{product.name as string}</h2>
            <p className="su-plan-tagline">{product.tagline as string}</p>
            <p className="su-plan-price">
              <span className="su-plan-amount">{product.price as string}</span>
              <span className="su-plan-freq">{product.frequency as string}</span>
            </p>

            <ul className="su-plan-features">
              {features.map((f, i) => (
                <li key={i}>{f.text}</li>
              ))}
            </ul>

            <div className="su-what-next">
              <h3>What happens next</h3>
              <ol>
                <li>Complete payment through our secure checkout</li>
                <li>We build your brand playbook automatically</li>
                <li>Upload photos of your work from your phone</li>
                <li>Content starts publishing across all 8 platforms</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: signupStyles }} />
    </section>
  );
}

const signupStyles = `
  .su-page { padding: 64px 0; }
  .su-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: start;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .su-grid { grid-template-columns: 1fr; gap: 32px; }
  }

  .su-title {
    font-size: 28px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }
  .su-subtitle {
    font-size: 15px;
    color: #4b5563;
    margin-bottom: 32px;
    line-height: 1.5;
  }

  .su-legal {
    margin-top: 16px;
    font-size: 11px;
    color: #4b5563;
    line-height: 1.5;
  }
  .su-legal a { color: #4b5563; text-decoration: underline; }

  .su-plan-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 32px;
    position: sticky;
    top: 100px;
  }
  .su-plan-badge {
    display: inline-block;
    background: #1a1a1a;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 20px;
    margin-bottom: 16px;
  }
  .su-plan-name {
    font-size: 24px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
  }
  .su-plan-tagline {
    font-size: 14px;
    color: #4b5563;
    margin-bottom: 20px;
  }
  .su-plan-amount {
    font-size: 36px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
  }
  .su-plan-freq { font-size: 14px; color: #4b5563; }
  .su-plan-price { margin-bottom: 24px; }

  .su-plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 24px;
  }
  .su-plan-features li {
    font-size: 13px;
    color: #374151;
    padding: 5px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .su-plan-features li::before {
    content: "✓";
    color: #22c55e;
    font-weight: 600;
    flex-shrink: 0;
  }

  .su-what-next {
    border-top: 1px solid #e5e7eb;
    padding-top: 20px;
  }
  .su-what-next h3 {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 12px;
  }
  .su-what-next ol {
    list-style: none;
    padding: 0;
    counter-reset: step;
  }
  .su-what-next li {
    font-size: 13px;
    color: #4b5563;
    padding: 4px 0;
    counter-increment: step;
    display: flex;
    gap: 10px;
  }
  .su-what-next li::before {
    content: counter(step);
    background: #e5e7eb;
    color: #374151;
    font-size: 11px;
    font-weight: 600;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
`;
