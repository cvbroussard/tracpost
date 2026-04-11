import React from "react";

export interface SiteTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  fontFamily: string;
  headingFontFamily: string;
  borderRadius: string;
}

export interface SiteNav {
  label: string;
  href: string;
  active?: boolean;
}

interface LayoutProps {
  siteName: string;
  tagline?: string;
  location?: string;
  phone?: string;
  logoUrl?: string;
  theme: SiteTheme;
  nav: SiteNav[];
  blogUrl?: string;
  projectsUrl?: string;
  children: React.ReactNode;
}

/**
 * Extract Google Font families from CSS font string.
 */
function googleFontsUrl(fontFamily: string, headingFamily: string): string | null {
  const systemFonts = new Set([
    "system-ui", "sans-serif", "serif", "monospace",
    "segoe ui", "helvetica neue", "helvetica", "arial", "georgia",
  ]);

  const fonts = new Set<string>();
  for (const family of [fontFamily, headingFamily]) {
    family.split(",").forEach((f) => {
      const clean = f.trim().replace(/^['"]|['"]$/g, "");
      if (!systemFonts.has(clean.toLowerCase())) fonts.add(clean);
    });
  }

  if (fonts.size === 0) return null;
  const families = [...fonts].map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export default function Layout({
  siteName,
  tagline,
  location,
  phone,
  logoUrl,
  theme,
  nav,
  blogUrl,
  projectsUrl,
  children,
}: LayoutProps) {
  const fontsUrl = googleFontsUrl(theme.fontFamily, theme.headingFontFamily);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {fontsUrl && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fontsUrl} />
          </>
        )}
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --ws-primary: ${theme.primaryColor};
            --ws-accent: ${theme.accentColor};
            --ws-bg: ${theme.backgroundColor};
            --ws-text: ${theme.textColor};
            --ws-muted: ${theme.mutedColor};
            --ws-border: ${theme.borderColor};
            --ws-font: ${theme.fontFamily};
            --ws-heading-font: ${theme.headingFontFamily};
            --ws-radius: ${theme.borderRadius};
          }
          ${resetStyles}
          ${siteStyles}
        `}} />
      </head>
      <body>
        {/* Header */}
        <header className="ws-header">
          <div className="ws-container ws-header-inner">
            <a href="/" className="ws-brand">
              {logoUrl && <img src={logoUrl} alt={siteName} className="ws-logo" />}
              <span className="ws-brand-name">{siteName}</span>
            </a>
            <nav className="ws-nav">
              {nav.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={`ws-nav-link ${item.active ? "ws-nav-active" : ""}`}
                >
                  {item.label}
                </a>
              ))}
              {blogUrl && <a href={blogUrl} className="ws-nav-link">Blog</a>}
              {projectsUrl && <a href={projectsUrl} className="ws-nav-link">Projects</a>}
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main>{children}</main>

        {/* Footer */}
        <footer className="ws-footer">
          <div className="ws-container ws-footer-inner">
            <div className="ws-footer-brand">
              <span className="ws-footer-name">{siteName}</span>
              {tagline && <p className="ws-footer-tagline">{tagline}</p>}
              {(location || phone) && (
                <p className="ws-footer-contact">
                  {location}{location && phone && " · "}{phone}
                </p>
              )}
            </div>
            <div className="ws-footer-links">
              <div className="ws-footer-nav">
                {nav.map((item) => (
                  <a key={item.label} href={item.href} className="ws-footer-link">
                    {item.label}
                  </a>
                ))}
                {blogUrl && <a href={blogUrl} className="ws-footer-link">Blog</a>}
                {projectsUrl && <a href={projectsUrl} className="ws-footer-link">Projects</a>}
              </div>
              <p className="ws-powered">
                <a href="https://tracpost.com" target="_blank" rel="noopener noreferrer">
                  Powered by TracPost
                </a>
              </p>
            </div>
          </div>
          <div className="ws-container ws-copyright">
            &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}

const resetStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: var(--ws-font);
    color: var(--ws-text);
    background: var(--ws-bg);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  img { max-width: 100%; display: block; }
  a { color: inherit; }
`;

const siteStyles = `
  .ws-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Header */
  .ws-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--ws-bg);
    border-bottom: 1px solid var(--ws-border);
    backdrop-filter: blur(12px);
    background: color-mix(in srgb, var(--ws-bg) 92%, transparent);
  }

  .ws-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
  }

  .ws-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
  }

  .ws-logo {
    width: 40px;
    height: 40px;
    border-radius: var(--ws-radius);
    object-fit: cover;
  }

  .ws-brand-name {
    font-family: var(--ws-heading-font);
    font-size: 20px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.01em;
  }

  .ws-nav {
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .ws-nav-link {
    font-size: 15px;
    font-weight: 500;
    color: var(--ws-muted);
    text-decoration: none;
    transition: color 0.15s;
  }

  .ws-nav-link:hover, .ws-nav-active {
    color: var(--ws-primary);
  }

  /* Footer */
  .ws-footer {
    background: color-mix(in srgb, var(--ws-primary) 6%, var(--ws-bg));
    border-top: 1px solid var(--ws-border);
    padding: 48px 0 24px;
    margin-top: 80px;
  }

  .ws-footer-inner {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    padding-bottom: 32px;
    border-bottom: 1px solid var(--ws-border);
  }

  .ws-footer-name {
    font-family: var(--ws-heading-font);
    font-size: 18px;
    font-weight: 700;
    color: var(--ws-primary);
  }

  .ws-footer-tagline {
    font-size: 14px;
    color: var(--ws-muted);
    margin-top: 6px;
    font-style: italic;
    max-width: 400px;
  }

  .ws-footer-contact {
    font-size: 13px;
    color: var(--ws-muted);
    margin-top: 8px;
  }

  .ws-footer-nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ws-footer-link {
    font-size: 14px;
    color: var(--ws-muted);
    text-decoration: none;
  }

  .ws-footer-link:hover { color: var(--ws-accent); }

  .ws-powered {
    margin-top: 16px;
    font-size: 11px;
  }

  .ws-powered a {
    color: var(--ws-muted);
    text-decoration: none;
    opacity: 0.6;
  }

  .ws-powered a:hover { opacity: 1; }

  .ws-copyright {
    padding-top: 16px;
    font-size: 12px;
    color: var(--ws-muted);
    opacity: 0.6;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .ws-header-inner { height: 60px; }
    .ws-nav { gap: 20px; }
    .ws-nav-link { font-size: 14px; }
    .ws-footer-inner { flex-direction: column; }
  }

  /* Section utilities */
  .ws-section {
    padding: 80px 0;
  }

  .ws-section-alt {
    padding: 80px 0;
    background: color-mix(in srgb, var(--ws-primary) 3%, var(--ws-bg));
  }

  .ws-section-title {
    font-family: var(--ws-heading-font);
    font-size: 32px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }

  .ws-section-subtitle {
    font-size: 17px;
    color: var(--ws-muted);
    max-width: 600px;
    line-height: 1.6;
    margin-bottom: 40px;
  }

  .ws-btn {
    display: inline-block;
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    border-radius: var(--ws-radius);
    transition: all 0.2s;
  }

  .ws-btn-primary {
    background: var(--ws-accent);
    color: #fff;
  }

  .ws-btn-primary:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .ws-btn-outline {
    border: 2px solid var(--ws-border);
    color: var(--ws-primary);
  }

  .ws-btn-outline:hover {
    border-color: var(--ws-accent);
    color: var(--ws-accent);
  }
`;
