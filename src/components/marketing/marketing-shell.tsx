import type { TenantContext, SlotKey } from "@/lib/tenant-site";
import {
  blogHubUrl,
  projectsHubUrl,
  detectHostMode,
} from "@/lib/urls";

interface NavLink {
  label: string;
  href: string;
  active?: boolean;
}

interface MarketingShellProps {
  ctx: TenantContext;
  activePage?: SlotKey;
  children: React.ReactNode;
}

/**
 * Extract Google Font family names from a CSS font-family string.
 */
function extractGoogleFonts(fontFamily: string): string[] {
  const systemFonts = new Set([
    "system-ui", "sans-serif", "serif", "monospace", "cursive",
    "segoe ui", "helvetica neue", "helvetica", "arial", "georgia",
    "times new roman", "courier new", "monaco", "menlo",
  ]);

  return fontFamily
    .split(",")
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
    .filter((f) => !systemFonts.has(f.toLowerCase()));
}

function googleFontsUrl(fonts: string[]): string | null {
  if (fonts.length === 0) return null;
  const families = fonts.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

/**
 * Marketing-site shell — header, main, footer. Reads tenant context
 * for theming, nav, and contact info. Sibling to BlogShell but tuned
 * for the home/about/work/contact pages.
 */
export default async function MarketingShell({ ctx, activePage, children }: MarketingShellProps) {
  const { siteName, theme, logoUrl, location, phone, email, tagline, pageConfig } = ctx;
  const hostMode = await detectHostMode();

  // Build nav from page_config — respect enabled flag and label overrides.
  // Preview mode preserves /[slug] prefix so nav stays on preview.
  const prefix = hostMode === "preview" ? `/${ctx.siteSlug}` : "";

  function hrefFor(slotKey: SlotKey): string {
    if (slotKey === "blog") return blogHubUrl(ctx.siteSlug, ctx.customDomain, hostMode);
    if (slotKey === "projects") return projectsHubUrl(ctx.siteSlug, ctx.customDomain, hostMode);
    if (slotKey === "home") return prefix || "/";
    // about/work/contact — hardcoded MVP paths, prefixed under preview
    return `${prefix}/${slotKey}`;
  }

  const nav: NavLink[] = pageConfig
    .filter((slot) => slot.enabled)
    .map((slot) => ({
      label: slot.label,
      href: hrefFor(slot.key),
      active: activePage === slot.key,
    }));

  const fontsToLoad = new Set<string>();
  if (theme.fontFamily) extractGoogleFonts(theme.fontFamily).forEach((f) => fontsToLoad.add(f));
  if (theme.headingFontFamily) extractGoogleFonts(theme.headingFontFamily).forEach((f) => fontsToLoad.add(f));
  const fontsUrl = googleFontsUrl([...fontsToLoad]);

  const cssVars: React.CSSProperties = {
    "--ws-primary": theme.primaryColor,
    "--ws-accent": theme.accentColor,
    "--ws-bg": theme.backgroundColor,
    "--ws-text": theme.textColor,
    "--ws-muted": theme.mutedColor,
    "--ws-border": theme.borderColor,
    "--ws-font": theme.fontFamily,
    "--ws-heading-font": theme.headingFontFamily,
    "--ws-radius": theme.borderRadius,
  } as React.CSSProperties;

  return (
    <div className="marketing-site" style={cssVars}>
      {fontsUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsUrl} />
        </>
      )}

      <header className="ws-header">
        <div className="ws-container ws-header-inner">
          <a href="/" className="ws-brand" aria-label={siteName}>
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="ws-logo" />
            ) : (
              <span className="ws-brand-name">{siteName}</span>
            )}
          </a>
          <nav className="ws-nav">
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`ws-nav-link${item.active ? " ws-nav-active" : ""}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="ws-footer">
        <div className="ws-container ws-footer-inner">
          <div className="ws-footer-brand">
            <span className="ws-footer-name">{siteName}</span>
            {tagline && <p className="ws-footer-tagline">{tagline}</p>}
            {(location || phone || email) && (
              <p className="ws-footer-contact">
                {[location, phone, email].filter(Boolean).join(" · ")}
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

      <style dangerouslySetInnerHTML={{ __html: shellStyles }} />
    </div>
  );
}

const shellStyles = `
  .marketing-site {
    font-family: var(--ws-font);
    color: var(--ws-text);
    background: var(--ws-bg);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
  }
  .marketing-site main { flex: 1; }
  .marketing-site img { max-width: 100%; display: block; }
  .marketing-site a { color: inherit; }

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
    border-bottom: 1px solid var(--ws-border);
    background: color-mix(in srgb, var(--ws-bg) 92%, transparent);
    backdrop-filter: blur(12px);
  }
  .ws-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
  }
  .ws-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
  .ws-logo { height: 40px; width: auto; max-width: 200px; object-fit: contain; }
  .ws-brand-name {
    font-family: var(--ws-heading-font);
    font-size: 20px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.01em;
  }
  .ws-nav { display: flex; align-items: center; gap: 32px; }
  .ws-nav-link {
    font-size: 15px;
    font-weight: 500;
    color: var(--ws-muted);
    text-decoration: none;
    transition: color 0.15s;
  }
  .ws-nav-link:hover, .ws-nav-active { color: var(--ws-primary); }

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
  .ws-footer-contact { font-size: 13px; color: var(--ws-muted); margin-top: 8px; }
  .ws-footer-nav { display: flex; flex-direction: column; gap: 8px; }
  .ws-footer-link { font-size: 14px; color: var(--ws-muted); text-decoration: none; }
  .ws-footer-link:hover { color: var(--ws-accent); }
  .ws-powered { margin-top: 16px; font-size: 11px; }
  .ws-powered a { color: var(--ws-muted); text-decoration: none; opacity: 0.6; }
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
  .ws-section { padding: 80px 0; }
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
  .ws-btn-primary { background: var(--ws-accent); color: #fff; }
  .ws-btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .ws-btn-outline {
    border: 2px solid var(--ws-border);
    color: var(--ws-primary);
  }
  .ws-btn-outline:hover {
    border-color: var(--ws-accent);
    color: var(--ws-accent);
  }
`;
