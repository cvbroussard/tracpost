import Image from "next/image";
import { blogHubUrl, projectsHubUrl } from "@/lib/urls";
import Script from "next/script";

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
  siteSlug: string;
  customDomain?: string | null;
  description?: string;
  tagline?: string;
  navLinks: NavLink[];
  theme: BlogTheme;
  location?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  socialLinks?: Array<{ platform: string; url: string }>;
  ga4MeasurementId?: string | null;
  gscVerificationToken?: string | null;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Extract Google Font family names from a CSS font-family string.
 * "'Poppins', sans-serif" → ["Poppins"]
 * "'Playfair Display', Georgia, serif" → ["Playfair Display"]
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

/**
 * Build a Google Fonts URL from font family names.
 */
function googleFontsUrl(fonts: string[]): string | null {
  if (fonts.length === 0) return null;
  const families = fonts.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export default function BlogShell({
  siteName,
  siteSlug,
  customDomain,
  description,
  tagline,
  navLinks,
  theme,
  location,
  phone,
  websiteUrl,
  socialLinks,
  ga4MeasurementId,
  gscVerificationToken,
  aside,
  children,
}: BlogShellProps) {
  // Build final nav: tenant links (from DB) + platform links (Blog, Projects)
  const blogUrl = blogHubUrl(siteSlug, customDomain);
  const projectsUrl = projectsHubUrl(siteSlug, customDomain);

  // Filter out any tenant-stored Blog/Projects links (we generate those)
  const tenantLinks = navLinks.filter((l) => {
    const lower = l.label.toLowerCase();
    return lower !== "blog" && lower !== "projects";
  });

  const finalNav: NavLink[] = [
    ...tenantLinks,
    { label: "Blog", href: blogUrl },
    { label: "Projects", href: projectsUrl },
  ];

  // Collect Google Fonts to load
  const fontsToLoad = new Set<string>();
  if (theme.fontFamily) extractGoogleFonts(theme.fontFamily).forEach((f) => fontsToLoad.add(f));
  if (theme.headingFontFamily) extractGoogleFonts(theme.headingFontFamily).forEach((f) => fontsToLoad.add(f));
  const fontsUrl = googleFontsUrl([...fontsToLoad]);

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
      {/* Google Fonts */}
      {fontsUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsUrl} />
        </>
      )}

      {/* GA4 */}
      {ga4MeasurementId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`} strategy="afterInteractive" />
          <Script id="ga4-blog-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4MeasurementId}');`}
          </Script>
        </>
      )}

      {gscVerificationToken && (
        <meta name="google-site-verification" content={gscVerificationToken} />
      )}

      {/* Site Header */}
      <header className="bs-header">
        <div className="bs-header-inner">
          <a href={navLinks[0]?.href || "/"} className="bs-brand" aria-label={siteName}>
            {theme.logoUrl ? (
              <Image src={theme.logoUrl} alt={siteName} className="bs-logo" width={160} height={40} sizes="160px" quality={75} />
            ) : (
              <span className="bs-site-name">{siteName}</span>
            )}
          </a>
          <nav className="bs-nav">
            {finalNav.map((link) => (
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
          <div className="bs-footer-brand">
            <span className="bs-footer-name">{siteName}</span>
            {tagline && <p className="bs-footer-tagline">{tagline}</p>}
            {(location || phone) && (
              <p className="bs-footer-contact">
                {location}{location && phone && " · "}{phone}
              </p>
            )}
          </div>
          <div className="bs-footer-right">
            {socialLinks && socialLinks.length > 0 && (
              <div className="bs-footer-social">
                {socialLinks.map((s) => (
                  <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer" className="bs-social-link">
                    {s.platform}
                  </a>
                ))}
              </div>
            )}
            <div className="bs-footer-meta">
              <span className="bs-copyright">&copy; {new Date().getFullYear()} {siteName}</span>
              <a
                href="https://tracpost.com"
                target="_blank"
                rel="noopener noreferrer"
                className="bs-powered"
              >
                Powered by TracPost
              </a>
            </div>
          </div>
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
    backdrop-filter: blur(12px);
    background: color-mix(in srgb, var(--bs-bg) 92%, transparent);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .bs-header-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .bs-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
  }

  .bs-logo {
    height: 40px;
    width: auto;
    max-width: 200px;
    object-fit: contain;
  }

  .bs-site-name {
    font-family: var(--bs-heading-font);
    font-size: 20px;
    font-weight: 700;
    color: var(--bs-primary);
    letter-spacing: -0.01em;
  }

  .bs-nav {
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .bs-nav-link {
    font-size: 15px;
    font-weight: 500;
    color: var(--bs-muted);
    text-decoration: none;
    transition: color 0.15s;
    letter-spacing: 0.01em;
  }

  .bs-nav-link:hover {
    color: var(--bs-primary);
  }

  /* Body — two-column */
  .bs-body {
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 48px 24px;
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 56px;
    flex: 1;
  }

  .bs-main {
    min-width: 0;
  }

  .bs-aside {
    font-size: 14px;
  }

  /* Article cards */
  .bs-article-card {
    display: block;
    text-decoration: none;
    color: inherit;
    padding: 28px 0;
    border-bottom: 1px solid var(--bs-border);
    transition: opacity 0.15s;
  }

  .bs-article-card:first-child {
    padding-top: 0;
  }

  .bs-article-card:hover {
    opacity: 0.85;
  }

  .bs-article-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--bs-radius);
    margin-bottom: 16px;
  }

  .bs-article-title {
    font-family: var(--bs-heading-font);
    font-size: 22px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--bs-primary);
    margin: 0 0 8px;
    letter-spacing: -0.01em;
  }

  .bs-article-excerpt {
    font-size: 15px;
    line-height: 1.6;
    color: var(--bs-muted);
    margin: 0 0 10px;
  }

  .bs-article-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--bs-muted);
  }

  .bs-article-pillar {
    color: var(--bs-accent);
    font-weight: 500;
  }

  /* Footer */
  .bs-footer {
    border-top: 1px solid var(--bs-border);
    margin-top: auto;
    background: color-mix(in srgb, var(--bs-primary) 4%, var(--bs-bg));
  }

  .bs-footer-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 40px;
  }

  .bs-footer-brand {
    max-width: 400px;
  }

  .bs-footer-name {
    font-family: var(--bs-heading-font);
    font-size: 16px;
    font-weight: 600;
    color: var(--bs-primary);
  }

  .bs-footer-tagline {
    font-size: 14px;
    color: var(--bs-muted);
    margin-top: 6px;
    line-height: 1.5;
    font-style: italic;
  }

  .bs-footer-contact {
    font-size: 13px;
    color: var(--bs-muted);
    margin-top: 8px;
  }

  .bs-footer-right {
    text-align: right;
  }

  .bs-footer-social {
    display: flex;
    gap: 16px;
    justify-content: flex-end;
    margin-bottom: 12px;
  }

  .bs-social-link {
    font-size: 13px;
    color: var(--bs-muted);
    text-decoration: none;
    text-transform: capitalize;
  }

  .bs-social-link:hover {
    color: var(--bs-accent);
  }

  .bs-footer-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
    font-size: 12px;
  }

  .bs-copyright {
    color: var(--bs-muted);
    opacity: 0.7;
  }

  .bs-powered {
    color: var(--bs-muted);
    text-decoration: none;
    opacity: 0.5;
    font-size: 11px;
  }

  .bs-powered:hover {
    opacity: 0.8;
  }

  /* Aside components */
  .bs-aside-section {
    margin-bottom: 32px;
  }

  .bs-aside-title {
    font-family: var(--bs-heading-font);
    font-size: 12px;
    font-weight: 600;
    color: var(--bs-primary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--bs-accent);
  }

  .bs-aside-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .bs-aside-list li {
    padding: 10px 0;
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
    font-weight: 500;
  }

  .bs-aside-list a:hover {
    color: var(--bs-accent);
  }

  .bs-aside-date {
    font-size: 12px;
    color: var(--bs-muted);
    margin-top: 3px;
  }

  /* Responsive — collapse to single column */
  @media (max-width: 768px) {
    .bs-body {
      grid-template-columns: 1fr;
      padding: 32px 16px;
      gap: 32px;
    }

    .bs-header-inner {
      padding: 0 16px;
      height: 60px;
    }

    .bs-nav {
      gap: 20px;
    }

    .bs-nav-link {
      font-size: 14px;
    }

    .bs-footer-inner {
      flex-direction: column;
      gap: 24px;
    }

    .bs-footer-right {
      text-align: left;
    }

    .bs-footer-social {
      justify-content: flex-start;
    }

    .bs-footer-meta {
      align-items: flex-start;
    }

    .bs-article-title {
      font-size: 19px;
    }
  }
`;
