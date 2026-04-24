import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog — TracPost",
  description: "Recent releases, features, and improvements to the TracPost platform.",
};

const ENTRIES = [
  {
    date: "April 16, 2026",
    entries: [
      { title: "Speech-to-text dictation on asset captions", body: "Dictate context notes with your phone mic. Comma-separated descriptors, cursor-aware insertion. Chrome + Safari supported via Web Speech API." },
      { title: "Service entity + GBP category intelligence", body: "6–8 service tiles auto-derived from your brand playbook, anchored to Google Business Profile categories for local SEO. Services appear on the /work page and each gets a /services/[slug] detail page with schema.org markup." },
      { title: "Free GBP category diagnostic", body: "Public tool at /tools/gbp-diagnostic. Enter your business type, get primary + additional GBP category recommendations with reasoning. No signup required." },
      { title: "TracPost marketing site", body: "New marketing site scaffold at next.tracpost.com. 14-section homepage, pricing page, 8 industry landing pages, ROI calculator, live network feed, auto-populated case studies." },
    ],
  },
  {
    date: "April 15, 2026",
    entries: [
      { title: "Image replace-in-place", body: "Referenced assets can no longer be force-deleted. Instead, upload a replacement — bytes overwrite the existing R2 object at the same URL, so every reference (blog body, OG images, social posts) keeps working. HEIC auto-converts to JPEG. Cloudflare edge cache purges instantly." },
      { title: "Media library sort fix", body: "Oldest/newest sort now selects from the correct end of the dataset. Project filter moved into SQL so narrow project views show all matching assets regardless of library size." },
      { title: "HEIC cleanup pipeline", body: "Original HEIC files are now deleted from R2 after JPEG conversion. Orphan cleanup script reclaimed 384 MB from existing uploads." },
      { title: "Cloudflare CDN cache purge", body: "Replace and delete operations now purge the Cloudflare edge cache for the affected URL. New images appear immediately instead of serving stale bytes for up to 24 hours." },
    ],
  },
  {
    date: "April 14, 2026",
    entries: [
      { title: "Centralized marketing with 6-slot page model", body: "Every tenant marketing site now runs on ISR with variant dispatch. Six stable page slots (home, about, work, blog, projects, contact) with per-slot variant selection. SaaS and service-business variants for home, about, work, and contact." },
      { title: "TracPost as tenant of itself", body: "TracPost's public site renders through the same centralized tenant engine as every other customer. Blog, projects, and marketing pages all served from the same codebase." },
      { title: "Phase 3 cleanup", body: "Removed the legacy static-site deploy pipeline (website spinner). 2,393 lines of dead code deleted. Copy generator moved to lib/tenant-site/." },
    ],
  },
  {
    date: "April 13, 2026",
    entries: [
      { title: "Route refactor complete", body: "Migrated from subdomain-based routing (blog.*, projects.*) to path-based routing (/blog/*, /projects/*). Custom domain resolution via middleware. Preview subdomain for stakeholder previews with automatic 301 graduation post-DNS-cutover." },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 780 }}>
          <h1 className="mp-section-title" style={{ fontSize: 44 }}>Changelog</h1>
          <p className="mp-section-subtitle" style={{ maxWidth: "none", marginBottom: 56 }}>
            What we shipped, when we shipped it.
          </p>

          <div className="mp-cl-timeline">
            {ENTRIES.map((group) => (
              <div key={group.date} className="mp-cl-group">
                <h2 className="mp-cl-date">{group.date}</h2>
                <div className="mp-cl-items">
                  {group.entries.map((entry) => (
                    <div key={entry.title} className="mp-cl-item">
                      <h3 className="mp-cl-title">{entry.title}</h3>
                      <p className="mp-cl-body">{entry.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: clStyles }} />
    </>
  );
}

const clStyles = `
  .mp-cl-timeline { display: flex; flex-direction: column; gap: 48px; }
  .mp-cl-date {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #4b5563;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  .mp-cl-items { display: flex; flex-direction: column; gap: 20px; }
  .mp-cl-item {
    padding-left: 20px;
    border-left: 2px solid #e5e7eb;
  }
  .mp-cl-title {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 6px;
  }
  .mp-cl-body {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.6;
  }
`;
