import Link from "next/link";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#product" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "Contractors", href: "/for/contractors" },
      { label: "Kitchen & Bath", href: "/for/kitchen-bath" },
      { label: "Interior Design", href: "/for/interior-design" },
      { label: "Real Estate", href: "/for/real-estate" },
      { label: "Restaurants", href: "/for/restaurants" },
      { label: "Salons & Spas", href: "/for/salons" },
      { label: "Coaches", href: "/for/coaches" },
      { label: "Agencies", href: "/for/agencies" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Case studies", href: "/projects" },
      { label: "GBP diagnostic (free)", href: "/tools/gbp-diagnostic" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="mp-footer">
      <div className="mp-container">
        <div className="mp-footer-grid">
          <div className="mp-footer-brand">
            <div className="mp-footer-logo">
              <img src="/icon.svg" alt="" className="mp-logo-icon" />
              <span className="mp-brand-name">TRACPOST</span>
            </div>
            <p className="mp-footer-tagline">
              We take care of marketing. You take care of business.
            </p>
            <p className="mp-footer-legal">
              TracPost is a product of Eppux LLC · Pittsburgh, PA
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="mp-footer-col">
              <h4 className="mp-footer-col-title">{col.title}</h4>
              <ul className="mp-footer-col-links">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="mp-footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mp-footer-bottom">
          <p>&copy; {new Date().getFullYear()} TracPost. All rights reserved.</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: footerStyles }} />
    </footer>
  );
}

const footerStyles = `
  .mp-footer {
    background: #fafafa;
    border-top: 1px solid #e5e7eb;
    padding: 64px 0 24px;
    margin-top: 80px;
  }
  .mp-footer-grid {
    display: grid;
    grid-template-columns: 1.5fr repeat(4, 1fr);
    gap: 40px;
    padding-bottom: 40px;
    border-bottom: 1px solid #e5e7eb;
  }
  @media (max-width: 768px) {
    .mp-footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  }
  .mp-footer-brand { display: flex; flex-direction: column; gap: 12px; }
  .mp-footer-logo { display: flex; align-items: center; gap: 8px; }
  .mp-footer-tagline {
    font-size: 14px;
    color: #6b7280;
    font-style: italic;
    max-width: 260px;
    line-height: 1.5;
  }
  .mp-footer-legal { font-size: 12px; color: #9ca3af; }
  .mp-footer-col-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #1a1a1a;
    margin-bottom: 16px;
  }
  .mp-footer-col-links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .mp-footer-link {
    font-size: 14px;
    color: #6b7280;
    text-decoration: none;
    transition: color 0.15s;
  }
  .mp-footer-link:hover { color: #1a1a1a; }
  .mp-footer-bottom {
    padding-top: 20px;
    font-size: 12px;
    color: #9ca3af;
  }
`;
