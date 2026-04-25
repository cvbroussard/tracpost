import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "What Is TracPost? — The Marketing Engine for Local Businesses",
  description:
    "TracPost isn't a social media tool, an agency, or a CMS. It's the convergence of everything a local business needs to turn their work into marketing.",
  alternates: {
    canonical: "https://tracpost.com/product",
  },
};

const CATEGORY_CARDS = [
  {
    category: "Scheduling Tools",
    does: "Distribute posts to 2-3 platforms on a calendar.",
    stops: "You still have to write the caption, pick the image, and decide when to post.",
  },
  {
    category: "Marketing Agencies",
    does: "Post generic content on your behalf.",
    stops: "They need your photos, your approval, and $2,000/month — and the content still doesn't sound like you.",
  },
  {
    category: "Website Builders",
    does: "Give you a static brochure site.",
    stops: "The site goes stale the week after launch. No ongoing content, no blog, no SEO momentum.",
  },
  {
    category: "AI Writing Tools",
    does: "Generate text from prompts you type.",
    stops: "You still have to prompt it, review it, format it, and post it somewhere. Another blank screen.",
  },
  {
    category: "SEO Tools",
    does: "Analyze your rankings and suggest improvements.",
    stops: "They tell you what to write. They don't write it, publish it, or promote it.",
  },
  {
    category: "Marketing Automation",
    does: "Automate email sequences and CRM workflows.",
    stops: "Great for nurturing leads you already have. Does nothing to attract new ones.",
  },
];

const CONVERGENCE_ITEMS = [
  {
    replaces: "A scheduling tool",
    with: "TracPost publishes across Instagram, TikTok, Facebook, YouTube, Pinterest, LinkedIn, X, and Google Business Profile.",
  },
  {
    replaces: "A content writer",
    with: "TracPost derives your Brand DNA and writes in your voice.",
  },
  {
    replaces: "A blog platform",
    with: "TracPost generates SEO-optimized articles from your work.",
  },
  {
    replaces: "A website",
    with: "TracPost generates and hosts your site.",
  },
  {
    replaces: "A GBP management service",
    with: "TracPost handles posts, photos, and review responses.",
  },
  {
    replaces: "An SEO service",
    with: "TracPost generates the content that ranks.",
  },
  {
    replaces: "An ad buyer",
    with: "TracPost amplifies your best-performing content with paid campaigns.",
  },
];

const WORKFLOW_STEPS = [
  {
    step: "1",
    label: "Capture",
    description: "5-10 project photos from your phone.",
    placeholder: "[PLACEHOLDER: Step icon — camera]",
  },
  {
    step: "2",
    label: "Derive",
    description: "Brand DNA extracted from your work and voice.",
    placeholder: "[PLACEHOLDER: Step icon — DNA helix]",
  },
  {
    step: "3",
    label: "Create",
    description: "Platform-native content written in your voice.",
    placeholder: "[PLACEHOLDER: Step icon — pen]",
  },
  {
    step: "4",
    label: "Publish",
    description: "8 platforms + website + blog — simultaneously.",
    placeholder: "[PLACEHOLDER: Step icon — rocket]",
  },
  {
    step: "5",
    label: "Amplify",
    description: "Paid campaigns for top-performing content.",
    placeholder: "[PLACEHOLDER: Step icon — megaphone]",
  },
];

export default function ProductPage() {
  return (
    <>
      {/* ── Section 1: Hero ── */}
      <section className="pp-hero">
        <div className="mp-container pp-hero-inner">
          <h1 className="pp-hero-title">
            TracPost Isn&apos;t a Social Media Tool.
            <br />
            Here&apos;s What It Actually Is.
          </h1>
          <p className="pp-hero-subtitle">
            If you&apos;ve been trying to figure out what category TracPost fits into, stop.
            The category doesn&apos;t exist yet.
          </p>
        </div>
      </section>

      {/* ── Section 2: The Blank Screen Problem ── */}
      <section className="mp-section">
        <div className="mp-container pp-prose-section">
          <h2 className="mp-section-title">Every Other Tool Starts With a Blank Screen</h2>
          <div className="pp-prose">
            <p>
              Scheduling tools assume you already have a caption written. AI writing tools assume you
              know what to prompt. CMS platforms assume you have time to build pages. Every tool in the
              marketing stack starts with a blank field and waits for you to fill it.
            </p>
            <p>
              But you&apos;re a business owner who just finished a 10-hour day. You have photos on your
              phone from a project that turned out great. The last thing you want to do is sit down,
              open a scheduling app, and stare at a cursor blinking in an empty caption field.
            </p>
            <p>
              That blank screen is a wall. And for most businesses, it&apos;s the reason their marketing
              never happens consistently. The work gets done. The photos exist. But the gap between
              &ldquo;I have photos&rdquo; and &ldquo;my business is visible online&rdquo; never gets closed.
            </p>
          </div>
          <div className="pp-comparison-img">
            <img
              src="https://assets.tracpost.com/marketing/blank-screen-comparison.png"
              alt="Left: a scheduling tool's empty post interface waiting for content. Right: a contractor on a job site capturing project photos in TracPost, ready to publish."
              width={1200}
              height={600}
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ── Section 3: Category Teardown ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container">
          <h2 className="mp-section-title mp-text-center">Where Every Existing Solution Stops</h2>
          <p className="mp-section-subtitle mp-text-center" style={{ margin: "0 auto 48px" }}>
            Each category solves one piece. None of them solve the whole problem.
          </p>
          <div className="pp-teardown-grid">
            {CATEGORY_CARDS.map((card) => (
              <div key={card.category} className="pp-teardown-card">
                <h3 className="pp-teardown-category">{card.category}</h3>
                <p className="pp-teardown-does">
                  <strong>What it does:</strong> {card.does}
                </p>
                <p className="pp-teardown-stops">
                  <strong>Where it stops:</strong> {card.stops}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: The Convergence ── */}
      <section className="mp-section">
        <div className="mp-container">
          <h2 className="mp-section-title mp-text-center">What TracPost Actually Replaces</h2>
          <p className="mp-section-subtitle mp-text-center" style={{ margin: "0 auto 48px" }}>
            Stop paying for six different tools that each do one thing. TracPost is the convergence.
          </p>
          <div className="pp-convergence-diagram">
            <svg viewBox="0 0 960 480" fill="none" xmlns="http://www.w3.org/2000/svg" className="pp-convergence-svg">
              <defs>
                <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#d1d5db" />
                  <stop offset="100%" stopColor="#374151" />
                </linearGradient>
                <linearGradient id="line-grad-out" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#374151" />
                  <stop offset="100%" stopColor="#d1d5db" />
                </linearGradient>
              </defs>

              {/* Left column — 7 items with icon, label, description */}
              {[
                { y: 0, icon: "M8 2v4M4 4h8M3 10h2l1-4h4l1 4h2M5 10v4a2 2 0 002 2h2a2 2 0 002-2v-4", label: "Scheduling Tool", desc: "Publishes across all 8 platforms." },
                { y: 66, icon: "M12 4a4 4 0 110 8 4 4 0 010-8zM6 20a6 6 0 0112 0", label: "Content Writer", desc: "Derives your Brand DNA, writes in your voice." },
                { y: 132, icon: "M4 6h16M4 10h16M4 14h10", label: "Blog Platform", desc: "Generates SEO-optimized articles from your work." },
                { y: 198, icon: "M3 3h18v14H3zM8 21h8M12 17v4", label: "Website / CMS", desc: "Generates and hosts your site." },
                { y: 264, icon: "M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z", label: "Review Manager", desc: "Handles posts, photos, and review responses." },
                { y: 330, icon: "M3 3v18h18M7 14l4-4 4 4 4-6", label: "SEO Service", desc: "Generates the content that ranks." },
                { y: 396, icon: "M3 12l5-8h8l5 8-5 8H8z", label: "Ad Campaigns", desc: "Amplifies top-performing content with paid campaigns." },
              ].map((item, i) => (
                <g key={i}>
                  <rect x="16" y={item.y + 8} width="44" height="44" rx="10" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.2" />
                  <g transform={`translate(26, ${item.y + 18})`}>
                    <path d={item.icon} stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </g>
                  <text x="72" y={item.y + 30} fill="#1a1a1a" fontSize="15" fontWeight="600" fontFamily="system-ui, sans-serif">{item.label}</text>
                  <text x="72" y={item.y + 48} fill="#6b7280" fontSize="12" fontFamily="system-ui, sans-serif">{item.desc}</text>
                  {/* Converging line */}
                  <line x1="340" y1={item.y + 30} x2="630" y2="240" stroke="url(#line-grad)" strokeWidth="2" />
                </g>
              ))}

              {/* Center — TracPost convergence point */}
              <circle cx="672" cy="240" r="56" fill="#1a1a1a" />
              <image href="/icon.svg" x="648" y="216" width="48" height="48" />
              <text x="672" y="316" fill="#1a1a1a" fontSize="18" fontWeight="700" fontFamily="system-ui, sans-serif" textAnchor="middle">TracPost</text>

              {/* Right side — output lines */}
              <line x1="727" y1="232" x2="840" y2="140" stroke="url(#line-grad-out)" strokeWidth="2" />
              <line x1="728" y1="237" x2="840" y2="239" stroke="url(#line-grad-out)" strokeWidth="2" />
              <line x1="728" y1="243" x2="840" y2="310" stroke="url(#line-grad-out)" strokeWidth="2" />
              <line x1="727" y1="248" x2="840" y2="375" stroke="url(#line-grad-out)" strokeWidth="2" />

              {/* Right labels */}
              <text x="852" y="144" fill="#1a1a1a" fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif">8 Platforms</text>
              <text x="852" y="160" fill="#6b7280" fontSize="11" fontFamily="system-ui, sans-serif">Instagram, TikTok, Facebook, YouTube,</text>
              <text x="852" y="174" fill="#6b7280" fontSize="11" fontFamily="system-ui, sans-serif">Pinterest, LinkedIn, X, and GBP</text>

              <text x="852" y="239" fill="#1a1a1a" fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif">Blog + Website</text>
              <text x="852" y="255" fill="#6b7280" fontSize="11" fontFamily="system-ui, sans-serif">SEO-optimized, generated and hosted</text>

              <text x="852" y="314" fill="#1a1a1a" fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif">GBP + Reviews</text>
              <text x="852" y="330" fill="#6b7280" fontSize="11" fontFamily="system-ui, sans-serif">Posts, photos, and AI review responses</text>

              <text x="852" y="374" fill="#1a1a1a" fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif">Paid Amplification</text>
              <text x="852" y="390" fill="#6b7280" fontSize="11" fontFamily="system-ui, sans-serif">Boost top-performing content</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Section 5: The Workflow ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container">
          <h2 className="mp-section-title mp-text-center">One Workflow. Everything Handled.</h2>
          <p className="mp-section-subtitle mp-text-center" style={{ margin: "0 auto 48px" }}>
            Five steps. You handle the first one. The engine handles the rest.
          </p>
          <div className="pp-workflow">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.label} className="pp-workflow-step">
                <div className="pp-workflow-icon-wrap">
                  <span className="pp-workflow-number">{step.step}</span>
                  <p className="pp-workflow-placeholder">{step.placeholder}</p>
                </div>
                <h3 className="pp-workflow-label">{step.label}</h3>
                <p className="pp-workflow-desc">{step.description}</p>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span className="pp-workflow-connector">&rarr;</span>
                )}
              </div>
            ))}
          </div>
          <p className="pp-workflow-anchor">
            You take photos of your work. Everything between the camera shutter and the published post
            is TracPost.
          </p>
        </div>
      </section>

      {/* ── Section 6: Real Output ── */}
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">See What the Engine Produces</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 48px" }}>
            Same project photos in, platform-native content out — across every channel.
          </p>
          <div className="pp-media-placeholder">
            [PLACEHOLDER: Grid of 4 real screenshots — an Instagram post, a blog article, a GBP
            update, and a website project page — all from the same project photo series]
          </div>
          <div className="pp-output-links">
            <a
              href="https://b2construct.com/blog"
              target="_blank"
              rel="noopener noreferrer"
              className="pp-output-link"
            >
              See a real subscriber&apos;s blog &rarr;
            </a>
            <a
              href="https://epicuriouskitchens.com/blog"
              target="_blank"
              rel="noopener noreferrer"
              className="pp-output-link"
            >
              Another example &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* ── Section 7: Who It's For ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container pp-prose-section">
          <h2 className="mp-section-title">Built for Businesses Where the Work Speaks for Itself</h2>
          <div className="pp-prose">
            <p>
              Restaurants plating dishes every night. Salons finishing color transformations every hour.
              Med spas documenting before-and-afters. HVAC companies replacing systems in 110-degree
              attics. Groomers, venues, dental practices, auto detailers, landscapers, painters,
              flooring installers, pool builders, pressure washers, and hundreds of other businesses
              that produce visual proof of their work every single day.
            </p>
            <p>
              If your customers find you by searching, and your work looks better in photos than in
              words — TracPost was built for you.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 8: CTA ── */}
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">
            Your Work Is the Content. TracPost Is the Engine.
          </h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 32px" }}>
            Stop trying to be a marketer. Start letting your work market itself.
          </p>
          <div className="pp-cta-actions">
            <Link href="/how-it-works" className="mp-btn-primary mp-btn-lg">
              See How It Works
            </Link>
            <Link href="/contact" className="mp-btn-outline mp-btn-lg">
              Talk to Us
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: productStyles }} />
    </>
  );
}

const productStyles = `
  /* Shared section spacing */
  .mp-section { padding: 30px 0; }
  .mp-section-alt { background: #f9fafb; }
  .mp-section-title { font-size: 36px; font-weight: 700; color: #1a1a1a; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 16px; }
  .mp-section-subtitle { font-size: 18px; color: #4b5563; line-height: 1.6; max-width: 640px; margin-bottom: 48px; }
  .mp-text-center { text-align: center; }
  .mp-text-center .mp-section-subtitle { margin-left: auto; margin-right: auto; }

  /* Hero */
  .pp-hero {
    padding: 120px 0 80px;
    text-align: center;
  }
  .pp-hero-inner {
    max-width: 820px;
    margin: 0 auto;
  }
  .pp-hero-title {
    font-size: 52px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin-bottom: 24px;
  }
  .pp-hero-subtitle {
    font-size: 20px;
    color: #4b5563;
    line-height: 1.6;
    max-width: 640px;
    margin: 0 auto;
  }
  @media (max-width: 768px) {
    .pp-hero { padding: 56px 0 48px; }
    .pp-hero-title { font-size: 32px; }
    .pp-hero-subtitle { font-size: 17px; }
  }

  /* Prose sections */
  .pp-prose-section {
    max-width: 720px;
  }
  .pp-prose p {
    font-size: 17px;
    color: #374151;
    line-height: 1.75;
    margin-bottom: 20px;
  }
  .pp-prose p:last-child { margin-bottom: 0; }

  /* Convergence diagram */
  .pp-convergence-diagram {
    max-width: 900px;
    margin: 0 auto;
  }
  .pp-convergence-svg {
    width: 100%;
    height: auto;
  }

  /* Comparison image */
  .pp-comparison-img {
    margin-top: 40px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }
  .pp-comparison-img img {
    width: 100%;
    height: auto;
    display: block;
  }

  /* Media placeholder */
  .pp-media-placeholder {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 64px 32px;
    text-align: center;
    color: #4b5563;
    font-size: 14px;
    line-height: 1.6;
    margin-top: 40px;
  }

  /* Category teardown grid */
  .pp-teardown-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  @media (max-width: 1024px) { .pp-teardown-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 640px) { .pp-teardown-grid { grid-template-columns: 1fr; } }
  .pp-teardown-card {
    padding: 28px 24px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
  }
  .pp-teardown-category {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 14px;
    letter-spacing: -0.01em;
  }
  .pp-teardown-does {
    font-size: 14px;
    color: #374151;
    line-height: 1.6;
    margin-bottom: 10px;
  }
  .pp-teardown-does strong { color: #1a1a1a; font-weight: 600; }
  .pp-teardown-stops {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.6;
  }
  .pp-teardown-stops strong { color: #1a1a1a; font-weight: 600; }

  /* Convergence list */
  .pp-convergence-list {
    max-width: 780px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .pp-convergence-item {
    display: grid;
    grid-template-columns: 200px 32px 1fr;
    gap: 8px;
    align-items: baseline;
    padding: 16px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .pp-convergence-item:last-child { border-bottom: none; }
  .pp-convergence-replaces {
    font-size: 15px;
    font-weight: 600;
    color: #4b5563;
    text-decoration: line-through;
    text-decoration-color: #d1d5db;
  }
  .pp-convergence-arrow {
    font-size: 16px;
    color: #d1d5db;
    text-align: center;
  }
  .pp-convergence-with {
    font-size: 15px;
    color: #1a1a1a;
    font-weight: 500;
    line-height: 1.5;
  }
  @media (max-width: 640px) {
    .pp-convergence-item {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .pp-convergence-arrow { display: none; }
    .pp-convergence-replaces { font-size: 13px; }
    .pp-convergence-with { font-size: 14px; }
  }

  /* Workflow pipeline */
  .pp-workflow {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    position: relative;
  }
  @media (max-width: 1024px) { .pp-workflow { grid-template-columns: repeat(3, 1fr); gap: 20px; } }
  @media (max-width: 640px) { .pp-workflow { grid-template-columns: 1fr; gap: 24px; } }
  .pp-workflow-step {
    text-align: center;
    position: relative;
  }
  .pp-workflow-icon-wrap {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: #f3f4f6;
    border: 2px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }
  .pp-workflow-number {
    font-size: 24px;
    font-weight: 700;
    color: #d1d5db;
  }
  .pp-workflow-placeholder {
    font-size: 8px;
    color: #9ca3af;
    margin: 0;
    display: none;
  }
  .pp-workflow-label {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 6px;
  }
  .pp-workflow-desc {
    font-size: 13px;
    color: #4b5563;
    line-height: 1.5;
  }
  .pp-workflow-connector {
    display: none;
  }
  .pp-workflow-anchor {
    text-align: center;
    font-size: 18px;
    font-weight: 500;
    color: #1a1a1a;
    margin-top: 48px;
    max-width: 640px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.6;
  }

  /* Real output section */
  .pp-output-links {
    display: flex;
    gap: 32px;
    justify-content: center;
    margin-top: 32px;
    flex-wrap: wrap;
  }
  .pp-output-link {
    font-size: 15px;
    font-weight: 500;
    color: #1a1a1a;
    text-decoration: none;
    border-bottom: 1px solid #d1d5db;
    padding-bottom: 2px;
    transition: border-color 0.15s;
  }
  .pp-output-link:hover {
    border-color: #1a1a1a;
  }

  /* CTA */
  .pp-cta-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }
`;
