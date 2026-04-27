import Link from "next/link";
import { sql } from "@/lib/db";

const NAV_ITEMS = [
  { label: "Product", href: "/product" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Compare", href: "/compare" },
  { label: "Pricing", href: "/pricing" },
];

// Funnel-shaped dropdown copy per slug. Distinct from the article titles —
// the dropdown is its own piece of marketing copy that pulls visitors deeper
// before they click. Order: Grab → Hook → Hook → Authority → Close.
const WHY_SOCIAL_COPY: Record<string, { headline: string; teaser: string; eyebrow?: string }> = {
  "humans-are-not-lone-wolves-business-has-always-been-social": {
    headline: "Humans Are Not Lone Wolves",
    teaser: "The two hundred thousand year old reason your business lives on social",
    eyebrow: "Start here",
  },
  "how-social-networks-were-actually-built-the-trojan-horse-of-free": {
    headline: "The Platforms Aren't Your Friend",
    teaser: "How social networks really work — and why understanding it changes how you use them",
  },
  "the-reach-hierarchy-how-many-people-actually-see-each-platform": {
    headline: "5.2 Billion Users — So What?",
    teaser: "Honest numbers per platform, and where the engaged audiences actually are",
  },
  "where-your-customers-actually-live-platform-fit-by-industry": {
    headline: "Where YOUR Customers Live",
    teaser: "The platform map for your specific industry — no generic advice",
  },
  "you-used-to-pick-one-the-new-math-says-all-of-them": {
    headline: "You Used to Pick One. Not Anymore.",
    teaser: "Why one platform done well is dead — and what replaced it",
  },
};

interface SeriesEntry {
  slug: string;
  index: number;
}

async function getWhySocialEntries(): Promise<SeriesEntry[]> {
  try {
    const rows = await sql`
      SELECT bp.slug, bp.metadata
      FROM blog_posts bp
      JOIN sites s ON s.id = bp.site_id
      WHERE s.blog_slug = 'tracpost'
        AND bp.status = 'published'
        AND bp.metadata->'series'->>'slug' = 'why-social-matters'
    `;
    return rows
      .map((r) => ({
        slug: r.slug as string,
        index: ((r.metadata as { series?: { index: number } })?.series?.index ?? 999),
      }))
      .sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

export async function MarketingNav() {
  const whySocial = await getWhySocialEntries();
  const showWhySocial = whySocial.length >= 2;

  return (
    <header className="mp-header">
      <div className="mp-container mp-header-inner">
        <Link href="/" className="mp-brand">
          <img src="/icon.svg" alt="TracPost" className="mp-logo-icon" />
          <span className="mp-brand-name">TRACPOST</span>
        </Link>

        <nav className="mp-nav">
          {showWhySocial && (
            <div className="mp-nav-dropdown-wrap">
              <button className="mp-nav-link mp-nav-trigger" aria-haspopup="true">
                Why Social?
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="mp-nav-dropdown" role="menu">
                <div className="mp-nav-dropdown-head">
                  <span className="mp-nav-dropdown-eyebrow">A 5-part series</span>
                  <h3 className="mp-nav-dropdown-title">Why Social Matters</h3>
                  <p className="mp-nav-dropdown-blurb">
                    Why your business lives or dies on social presence — and how to be everywhere at once.
                  </p>
                </div>
                <ol className="mp-nav-dropdown-list">
                  {whySocial.map((entry) => {
                    const copy = WHY_SOCIAL_COPY[entry.slug];
                    if (!copy) return null;
                    return (
                      <li key={entry.slug} role="menuitem">
                        <Link href={`/blog/${entry.slug}`} className="mp-nav-dropdown-link">
                          <span className="mp-nav-dropdown-num">Part {entry.index}</span>
                          <span className="mp-nav-dropdown-text">
                            {copy.eyebrow && <span className="mp-nav-dropdown-tag">{copy.eyebrow}</span>}
                            <span className="mp-nav-dropdown-headline">{copy.headline}</span>
                            <span className="mp-nav-dropdown-teaser">{copy.teaser}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          )}
          {NAV_ITEMS.map((item) => (
            <Link key={item.label} href={item.href} className="mp-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mp-header-actions">
          <Link href="https://studio.tracpost.com/login" className="mp-nav-link">
            Log in
          </Link>
          <Link href="/pricing" className="mp-btn-primary">
            Start 14-day trial
          </Link>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: navStyles }} />
    </header>
  );
}

const navStyles = `
  .mp-header {
    position: sticky;
    top: 0;
    z-index: 100;
    border-bottom: 1px solid #e5e7eb;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(12px);
  }
  .mp-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }
  .mp-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
  }
  .mp-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }
  .mp-logo-icon { height: 24px; width: 24px; }
  .mp-brand-name {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.12em;
  }
  .mp-nav {
    display: flex;
    align-items: center;
    gap: 32px;
  }
  .mp-nav-link {
    font-size: 14px;
    font-weight: 500;
    color: #4b5563;
    text-decoration: none;
    transition: color 0.15s;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .mp-nav-link:hover { color: #1a1a1a; }
  .mp-header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .mp-btn-primary {
    display: inline-block;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: #1a1a1a;
    border-radius: 6px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .mp-btn-primary:hover { background: #333; }

  /* "Why Social?" dropdown — funnel-shaped, hover-activated */
  .mp-nav-dropdown-wrap { position: relative; }
  .mp-nav-trigger svg { transition: transform 0.15s; }
  .mp-nav-dropdown-wrap:hover .mp-nav-trigger,
  .mp-nav-dropdown-wrap:focus-within .mp-nav-trigger { color: #1a1a1a; }
  .mp-nav-dropdown-wrap:hover .mp-nav-trigger svg,
  .mp-nav-dropdown-wrap:focus-within .mp-nav-trigger svg { transform: rotate(180deg); }

  .mp-nav-dropdown {
    position: absolute;
    top: calc(100% + 14px);
    left: 50%;
    transform: translateX(-50%) translateY(-4px);
    width: 540px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    box-shadow: 0 20px 56px rgba(0, 0, 0, 0.14), 0 2px 10px rgba(0, 0, 0, 0.04);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s, transform 0.18s;
  }
  .mp-nav-dropdown-wrap:hover .mp-nav-dropdown,
  .mp-nav-dropdown-wrap:focus-within .mp-nav-dropdown {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(-50%) translateY(0);
  }

  /* Hover bridge so the menu doesn't disappear when crossing the gap */
  .mp-nav-dropdown::before {
    content: "";
    position: absolute;
    top: -14px;
    left: 0;
    right: 0;
    height: 14px;
  }

  .mp-nav-dropdown-head {
    padding: 26px 30px 22px;
    border-bottom: 1px solid #f3f4f6;
  }
  .mp-nav-dropdown-eyebrow {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .mp-nav-dropdown-title {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 8px;
    line-height: 1.25;
  }
  .mp-nav-dropdown-blurb {
    font-size: 13px;
    color: #4b5563;
    line-height: 1.55;
    margin: 0;
  }

  .mp-nav-dropdown-list {
    list-style: none;
    margin: 0;
    padding: 14px 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mp-nav-dropdown-list li { border-radius: 10px; }
  .mp-nav-dropdown-link {
    display: flex;
    gap: 14px;
    padding: 14px 14px;
    text-decoration: none;
    border-radius: 10px;
    transition: background 0.12s;
  }
  .mp-nav-dropdown-link:hover { background: #f9fafb; }
  .mp-nav-dropdown-num {
    font-size: 11px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    flex-shrink: 0;
    width: 56px;
    padding-top: 3px;
  }
  .mp-nav-dropdown-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mp-nav-dropdown-tag {
    display: inline-block;
    width: fit-content;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: #fff;
    background: #1a1a1a;
    padding: 3px 8px;
    border-radius: 4px;
    margin-bottom: 4px;
  }
  .mp-nav-dropdown-headline {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
    line-height: 1.3;
  }
  .mp-nav-dropdown-teaser {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .mp-nav { display: none; }
  }
`;
