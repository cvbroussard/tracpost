import Link from "next/link";

const NAV_ITEMS = [
  { label: "Product", href: "#product" },
  { label: "Industries", href: "#industries" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "#resources" },
];

export function MarketingNav() {
  return (
    <header className="mp-header">
      <div className="mp-container mp-header-inner">
        <Link href="/" className="mp-brand">
          <img src="/icon.svg" alt="TracPost" className="mp-logo-icon" />
          <span className="mp-brand-name">TRACPOST</span>
        </Link>

        <nav className="mp-nav">
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
  @media (max-width: 768px) {
    .mp-nav { display: none; }
  }
`;
