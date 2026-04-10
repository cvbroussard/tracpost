import Link from "next/link";

export interface BlogTheme {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
  fontFamily?: string;
  headingFontFamily?: string;
  borderRadius?: string;
  logoUrl?: string;
}

export interface NavLink {
  label: string;
  href: string;
}

interface BlogShellProps {
  siteName: string;
  description?: string;
  navLinks: NavLink[];
  theme: BlogTheme;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function BlogShell({
  siteName,
  description,
  navLinks,
  theme,
  aside,
  footer,
  children,
}: BlogShellProps) {
  return (
    <div className="blog-site" style={{
      "--bs-primary": theme.primaryColor || "#1a1a1a",
      "--bs-accent": theme.accentColor || "#3b82f6",
      "--bs-bg": theme.backgroundColor || "#ffffff",
      "--bs-text": theme.textColor || "#1a1a1a",
      "--bs-muted": theme.mutedColor || "#6b7280",
      "--bs-border": theme.borderColor || "#e5e7eb",
      "--bs-font": theme.fontFamily || "system-ui, sans-serif",
      "--bs-heading-font": theme.headingFontFamily || theme.fontFamily || "system-ui, sans-serif",
      "--bs-radius": theme.borderRadius || "6px",
    } as React.CSSProperties}>
      {/* Site Header */}
      <header className="bs-header">
        <div className="bs-header-inner">
          <div className="bs-brand">
            {theme.logoUrl && (
              <img src={theme.logoUrl} alt={siteName} className="bs-logo" />
            )}
            <span className="bs-site-name">{siteName}</span>
          </div>
          <nav className="bs-nav">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="bs-nav-link"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="bs-body">
        <main className="bs-main">
          {children}
        </main>
        {aside && (
          <aside className="bs-aside">
            {aside}
          </aside>
        )}
      </div>

      {/* Footer */}
      <footer className="bs-footer">
        <div className="bs-footer-inner">
          {footer || (
            <>
              <div className="bs-footer-brand">
                <span className="bs-footer-name">{siteName}</span>
                {description && <p className="bs-footer-desc">{description}</p>}
              </div>
              <div className="bs-footer-meta">
                <a
                  href="https://tracpost.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bs-powered"
                >
                  Powered by TracPost
                </a>
              </div>
            </>
          )}
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: shellStyles }} />
    </div>
  );
}

const shellStyles = `
  .blog-site {
    font-family: var(--bs-font);
    color: var(--bs-text);
    background: var(--bs-bg);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .bs-header {
    border-bottom: 1px solid var(--bs-border);
    background: var(--bs-bg);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .bs-header-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .bs-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bs-logo {
    width: 36px;
    height: 36px;
    border-radius: var(--bs-radius);
    object-fit: cover;
  }

  .bs-site-name {
    font-family: var(--bs-heading-font);
    font-size: 18px;
    font-weight: 600;
    color: var(--bs-primary);
  }

  .bs-nav {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .bs-nav-link {
    font-size: 14px;
    color: var(--bs-muted);
    text-decoration: none;
    transition: color 0.15s;
  }

  .bs-nav-link:hover {
    color: var(--bs-primary);
  }

  /* Body — two-column */
  .bs-body {
    max-width: 1100px;
    margin: 0 auto;
    padding: 48px 24px;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 48px;
    flex: 1;
  }

  .bs-main {
    min-width: 0;
  }

  .bs-aside {
    font-size: 14px;
  }

  /* Footer */
  .bs-footer {
    border-top: 1px solid var(--bs-border);
    margin-top: auto;
  }

  .bs-footer-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 24px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .bs-footer-name {
    font-family: var(--bs-heading-font);
    font-size: 15px;
    font-weight: 600;
    color: var(--bs-primary);
  }

  .bs-footer-desc {
    font-size: 13px;
    color: var(--bs-muted);
    margin-top: 4px;
    max-width: 400px;
  }

  .bs-footer-meta {
    font-size: 12px;
  }

  .bs-powered {
    color: var(--bs-muted);
    text-decoration: none;
    opacity: 0.7;
  }

  .bs-powered:hover {
    opacity: 1;
  }

  /* Aside components */
  .bs-aside-section {
    margin-bottom: 32px;
  }

  .bs-aside-title {
    font-family: var(--bs-heading-font);
    font-size: 13px;
    font-weight: 600;
    color: var(--bs-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  .bs-aside-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .bs-aside-list li {
    padding: 8px 0;
    border-bottom: 1px solid var(--bs-border);
  }

  .bs-aside-list li:last-child {
    border-bottom: none;
  }

  .bs-aside-list a {
    color: var(--bs-text);
    text-decoration: none;
    font-size: 14px;
    line-height: 1.4;
  }

  .bs-aside-list a:hover {
    color: var(--bs-accent);
  }

  .bs-aside-date {
    font-size: 12px;
    color: var(--bs-muted);
    margin-top: 2px;
  }

  /* Responsive — collapse to single column */
  @media (max-width: 768px) {
    .bs-body {
      grid-template-columns: 1fr;
      padding: 32px 16px;
      gap: 32px;
    }

    .bs-header-inner {
      padding: 12px 16px;
    }

    .bs-nav {
      gap: 16px;
    }

    .bs-footer-inner {
      flex-direction: column;
      gap: 16px;
    }
  }
`;
