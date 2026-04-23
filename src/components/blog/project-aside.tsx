"use client";

import Image from "next/image";
import { projectUrl, blogArticleUrl } from "@/lib/urls";

interface ProjectNavItem {
  slug: string;
  name: string;
  coverImage: string | null;
  assetCount: number;
}

interface BlogNavItem {
  slug: string;
  title: string;
  published_at: string;
}

interface MonthNav {
  id: string;
  label: string;
  count: number;
}

interface ProjectMeta {
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  photoCount: number;
  status: string;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
  url: string | null;
}

interface Persona {
  id: string;
  name: string;
  type: string;
}

/**
 * Hub page aside — project nav + blog nav
 */
export function ProjectHubAside({
  siteSlug,
  projects,
  recentPosts,
  aboutText,
  projectsBaseUrl,
  blogBaseUrl,
}: {
  siteSlug: string;
  projects: ProjectNavItem[];
  recentPosts: BlogNavItem[];
  aboutText?: string;
  projectsBaseUrl: string | null;
  blogBaseUrl: string | null;
}) {
  return (
    <div className="pj-aside-sticky">
      {aboutText && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">About</h3>
          <p style={{ fontSize: 14, color: "var(--bs-muted)", lineHeight: 1.6 }}>
            {aboutText}
          </p>
        </div>
      )}

      {projects.length > 0 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Projects</h3>
          <div className="pj-aside-nav">
            {projects.map((p) => {
              const href = projectsBaseUrl
                ? `${projectsBaseUrl}/${p.slug}`
                : projectUrl(siteSlug, p.slug);
              return (
                <a key={p.slug} href={href} className="pj-aside-nav-item">
                  {p.coverImage && (
                    <Image src={p.coverImage} alt={p.name} className="pj-aside-thumb" width={80} height={60} sizes="80px" quality={75} />
                  )}
                  <div>
                    <span className="pj-aside-nav-name">{p.name}</span>
                    <span className="pj-aside-nav-count">{p.assetCount} photos</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {recentPosts.length > 0 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Recent Articles</h3>
          <ul className="bs-aside-list">
            {recentPosts.map((post) => {
              const href = blogBaseUrl
                ? `${blogBaseUrl}/${post.slug}`
                : blogArticleUrl(siteSlug, post.slug);
              return (
                <li key={post.slug}>
                  <a href={href}>{post.title}</a>
                  <div className="bs-aside-date">
                    {new Date(post.published_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: hubAsideStyles }} />
    </div>
  );
}

interface SiblingProject {
  slug: string;
  name: string;
  coverImage: string | null;
}

/**
 * Detail page aside — project nav + meta + month nav + materials + team
 */
export function ProjectDetailAside({
  meta,
  months,
  brands,
  personas,
  brandsBaseUrl,
  prev,
  next,
}: {
  meta: ProjectMeta;
  months: MonthNav[];
  brands: Brand[];
  personas: Persona[];
  brandsBaseUrl: string;
  prev?: SiblingProject | null;
  next?: SiblingProject | null;
}) {
  return (
    <div className="pj-aside-sticky">
      {/* Project navigation — prev/next */}
      {(prev || next) && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">More Projects</h3>
          <div className="pj-sibling-nav">
            {prev && (
              <a href={prev.slug} className="pj-sibling">
                {prev.coverImage && (
                  <Image src={prev.coverImage} alt={prev.name} className="pj-sibling-img" width={120} height={80} sizes="120px" quality={75} />
                )}
                <div>
                  <span className="pj-sibling-dir">&larr; Previous</span>
                  <span className="pj-sibling-name">{prev.name}</span>
                </div>
              </a>
            )}
            {next && (
              <a href={next.slug} className="pj-sibling">
                {next.coverImage && (
                  <Image src={next.coverImage} alt={next.name} className="pj-sibling-img" width={120} height={80} sizes="120px" quality={75} />
                )}
                <div>
                  <span className="pj-sibling-dir">Next &rarr;</span>
                  <span className="pj-sibling-name">{next.name}</span>
                </div>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Project meta */}
      <div className="bs-aside-section">
        <h3 className="bs-aside-title">Project Details</h3>
        <div className="pj-meta-card">
          {meta.startDate && (
            <div className="pj-meta-row">
              <span className="pj-meta-label">Timeline</span>
              <span className="pj-meta-value">
                {meta.startDate}{meta.endDate && meta.endDate !== meta.startDate ? ` — ${meta.endDate}` : ""}
              </span>
            </div>
          )}
          {meta.location && (
            <div className="pj-meta-row">
              <span className="pj-meta-label">Location</span>
              <span className="pj-meta-value">{meta.location}</span>
            </div>
          )}
          <div className="pj-meta-row">
            <span className="pj-meta-label">Photos</span>
            <span className="pj-meta-value">{meta.photoCount}</span>
          </div>
          <div className="pj-meta-row">
            <span className="pj-meta-label">Status</span>
            <span className={`pj-meta-status ${meta.status === "complete" ? "pj-status-complete" : ""}`}>
              {meta.status}
            </span>
          </div>
        </div>
      </div>

      {/* Month navigation */}
      {months.length > 1 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Timeline</h3>
          <nav className="pj-month-nav">
            {months.map((m) => (
              <a
                key={m.id}
                href={`#${m.id}`}
                className="pj-month-nav-item"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(m.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span>{m.label}</span>
                <span className="pj-month-nav-count">{m.count}</span>
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Materials */}
      {brands.length > 0 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Materials</h3>
          <div className="pj-aside-chips">
            {brands.map((b) => (
              <a key={b.id} href={`${brandsBaseUrl}/${b.slug}`} className="pj-aside-chip pj-aside-chip-link">
                {b.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Team */}
      {personas.length > 0 && (
        <div className="bs-aside-section">
          <h3 className="bs-aside-title">Team</h3>
          <div className="pj-aside-chips">
            {personas.map((p) => (
              <span key={p.id} className="pj-aside-chip">
                {p.name}
                <span className="pj-aside-chip-role">{p.type}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: detailAsideStyles }} />
    </div>
  );
}

const hubAsideStyles = `
  .pj-aside-sticky {
    position: sticky;
    top: 80px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
  }

  .pj-aside-nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pj-aside-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: calc(var(--bs-radius) / 2);
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
  }

  .pj-aside-nav-item:hover {
    background: color-mix(in srgb, var(--bs-primary) 5%, var(--bs-bg));
  }

  .pj-aside-thumb {
    width: 48px;
    height: 36px;
    object-fit: cover;
    border-radius: calc(var(--bs-radius) / 2);
    flex-shrink: 0;
  }

  .pj-aside-nav-name {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--bs-primary);
    line-height: 1.3;
  }

  .pj-aside-nav-count {
    display: block;
    font-size: 11px;
    color: var(--bs-muted);
    margin-top: 1px;
  }
`;

const detailAsideStyles = `
  .pj-aside-sticky {
    position: sticky;
    top: 80px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
  }

  /* Sibling project nav */
  .pj-sibling-nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pj-sibling {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: calc(var(--bs-radius) / 2);
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
  }

  .pj-sibling:hover {
    background: color-mix(in srgb, var(--bs-primary) 5%, var(--bs-bg));
  }

  .pj-sibling-img {
    width: 56px;
    height: 40px;
    object-fit: cover;
    border-radius: calc(var(--bs-radius) / 2);
    flex-shrink: 0;
  }

  .pj-sibling-dir {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-muted);
    margin-bottom: 2px;
  }

  .pj-sibling-name {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--bs-primary);
    line-height: 1.3;
  }

  .pj-meta-card {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .pj-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 6px 0;
    border-bottom: 1px solid var(--bs-border);
  }

  .pj-meta-row:last-child {
    border-bottom: none;
  }

  .pj-meta-label {
    font-size: 12px;
    color: var(--bs-muted);
  }

  .pj-meta-value {
    font-size: 13px;
    font-weight: 500;
    color: var(--bs-primary);
  }

  .pj-meta-status {
    font-size: 11px;
    font-weight: 500;
    text-transform: capitalize;
    padding: 2px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bs-muted) 15%, var(--bs-bg));
    color: var(--bs-muted);
  }

  .pj-status-complete {
    background: color-mix(in srgb, var(--bs-accent) 12%, var(--bs-bg));
    color: var(--bs-accent);
  }

  /* Month navigation */
  .pj-month-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pj-month-nav-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-radius: calc(var(--bs-radius) / 2);
    font-size: 13px;
    color: var(--bs-text);
    text-decoration: none;
    transition: background 0.15s;
    cursor: pointer;
  }

  .pj-month-nav-item:hover {
    background: color-mix(in srgb, var(--bs-primary) 5%, var(--bs-bg));
  }

  .pj-month-nav-count {
    font-size: 11px;
    color: var(--bs-muted);
  }

  /* Chips */
  .pj-aside-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pj-aside-chip {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: var(--bs-radius);
    border: 1px solid var(--bs-border);
    color: var(--bs-text);
  }

  .pj-aside-chip a {
    color: var(--bs-accent);
    text-decoration: none;
  }

  .pj-aside-chip a:hover {
    text-decoration: underline;
  }

  .pj-aside-chip-link {
    text-decoration: none;
    transition: border-color 0.15s, color 0.15s;
  }

  .pj-aside-chip-link:hover {
    border-color: var(--bs-accent);
    color: var(--bs-accent);
  }

  .pj-aside-chip-role {
    font-size: 10px;
    color: var(--bs-muted);
    margin-left: 4px;
    text-transform: capitalize;
  }
`;
