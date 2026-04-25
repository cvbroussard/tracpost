import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How TracPost Works — From Photos to 8 Platforms",
  description:
    "See how one series of project photos becomes platform-native content across Instagram, TikTok, Facebook, YouTube, Pinterest, LinkedIn, X, and Google Business Profile.",
  alternates: {
    canonical: "https://tracpost.com/how-it-works",
  },
};

const PLATFORM_CARDS = [
  {
    platform: "Instagram",
    description:
      "Carousel post with a detailed project caption, hashtags, and alt text — optimized for the Explore page.",
  },
  {
    platform: "TikTok",
    description:
      "Short-form caption tuned for discovery, trending sounds context, and niche hashtags that reach new audiences.",
  },
  {
    platform: "Facebook",
    description:
      "Community-focused post written for engagement — questions, local context, the kind of thing neighbors share.",
  },
  {
    platform: "YouTube",
    description:
      "Community post or Shorts caption that tells the project story in a format YouTube surfaces to subscribers.",
  },
  {
    platform: "Pinterest",
    description:
      "Optimized pin with a searchable description, board-ready formatting, and keywords people actually search for.",
  },
  {
    platform: "LinkedIn",
    description:
      "Professional project update positioned for your industry — credibility-building, not salesy.",
  },
  {
    platform: "X",
    description:
      "Concise, shareable take that works in the feed — punchy, visual, and written to earn retweets.",
  },
  {
    platform: "Google Business Profile",
    description:
      "Location-optimized business update that improves your local search ranking and keeps your profile active.",
  },
  {
    platform: "Blog",
    description:
      "Full SEO-optimized article telling the project story — title, meta description, structured headings, internal links.",
  },
  {
    platform: "Website",
    description:
      "Project page added to your portfolio with photos, descriptions, and schema markup for search engines.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="mp-section hiw-hero">
        <div className="mp-container" style={{ maxWidth: 820 }}>
          <h1 className="mp-section-title hiw-hero-title">
            One Series of Photos. Eight Platforms. Zero Extra Work.
          </h1>
          <p className="hiw-hero-subtitle">
            You capture 5-10 photos of your work. TracPost derives your Brand DNA,
            writes platform-native content, and publishes across Instagram, TikTok,
            Facebook, YouTube, Pinterest, LinkedIn, X, and Google Business Profile
            &mdash; plus your blog and website.
          </p>
          <div className="hiw-placeholder">
            [PLACEHOLDER: Hero image &mdash; a phone screen showing project photos on the
            left, with arrows fanning out to 8 platform icons on the right, plus blog
            and website icons]
          </div>
        </div>
      </section>

      {/* ── Step 1: Capture ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container" style={{ maxWidth: 760 }}>
          <span className="hiw-step-label">Step 1</span>
          <h2 className="mp-section-title">Capture Your Work</h2>
          <div className="hiw-prose">
            <p>
              You already do this. A series of 5&ndash;10 photos from a project &mdash;
              the before, the progress, the details, the finished result. The more you
              capture, the richer the content. One photo can work. A full series produces
              dramatically better results across every platform.
            </p>
          </div>
          <div className="hiw-placeholder">
            [PLACEHOLDER: Phone camera UI showing a series of 8 project photos being
            captured &mdash; e.g., a salon color correction from multiple angles]
          </div>
        </div>
      </section>

      {/* ── Step 2: Brand DNA ── */}
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 760 }}>
          <span className="hiw-step-label">Step 2</span>
          <h2 className="mp-section-title">TracPost Derives Your Brand DNA</h2>
          <div className="hiw-prose">
            <p>
              Before any content is written, TracPost studies your business &mdash; your
              industry, your location, your voice, your positioning. This Brand DNA shapes
              every caption, every article, every post. It&apos;s why the content sounds
              like someone who knows your business, not a generic template.
            </p>
          </div>
          <div className="hiw-placeholder">
            [PLACEHOLDER: Visual representation of Brand DNA &mdash; a profile card
            showing derived attributes: voice tone, industry context, market position,
            content style]
          </div>
        </div>
      </section>

      {/* ── Step 3: The Transformation ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container">
          <div className="mp-text-center" style={{ maxWidth: 760, margin: "0 auto" }}>
            <span className="hiw-step-label">Step 3</span>
            <h2 className="mp-section-title">One Series Becomes Everything</h2>
            <p className="hiw-transform-intro">
              The same project photos are transformed into 10 distinct outputs. Each one
              is written natively for the platform &mdash; different length, different
              tone, different format. These are not copy-pasted.
            </p>
          </div>
          <div className="hiw-platform-grid">
            {PLATFORM_CARDS.map((card) => (
              <div key={card.platform} className="hiw-platform-card">
                <h3 className="hiw-platform-name">{card.platform}</h3>
                <p className="hiw-platform-desc">{card.description}</p>
                <div className="hiw-placeholder hiw-placeholder-sm">
                  [PLACEHOLDER: Screenshot of an actual TracPost-published{" "}
                  {card.platform} post from a real project]
                </div>
              </div>
            ))}
          </div>
          <p className="hiw-transform-callout mp-text-center">
            These are not copy-pasted. Each one is written natively for the platform
            &mdash; different length, different tone, different format.
          </p>
        </div>
      </section>

      {/* ── The Math ── */}
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 820 }}>
          <h2 className="mp-section-title mp-text-center">The Time You Get Back</h2>
          <div className="hiw-comparison">
            <div className="hiw-compare-col hiw-compare-manual">
              <h3 className="hiw-compare-heading">Manual process</h3>
              <ul className="hiw-compare-list">
                <li>Research hashtags</li>
                <li>Write captions for each platform</li>
                <li>Format content per platform</li>
                <li>Log into 8 separate apps</li>
                <li>Schedule posts individually</li>
                <li>Write a blog article</li>
                <li>Update your website portfolio</li>
              </ul>
              <p className="hiw-compare-time">Hours per project</p>
            </div>
            <div className="hiw-compare-col hiw-compare-tracpost">
              <h3 className="hiw-compare-heading">TracPost</h3>
              <ul className="hiw-compare-list">
                <li>Take photos</li>
                <li>Upload</li>
                <li>Go back to work</li>
              </ul>
              <p className="hiw-compare-time">Minutes</p>
            </div>
          </div>
          <div className="hiw-placeholder" style={{ marginTop: 48 }}>
            [PLACEHOLDER: Side-by-side time comparison graphic &mdash; hourglass nearly
            full on left (manual), nearly empty on right (TracPost)]
          </div>
        </div>
      </section>

      {/* ── Real Output ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container" style={{ maxWidth: 760 }}>
          <h2 className="mp-section-title mp-text-center">
            Don&apos;t Take Our Word for It
          </h2>
          <div className="hiw-prose mp-text-center">
            <p>
              Every article, every post, every project page linked below was produced by
              TracPost from photos a business owner captured on their phone.
            </p>
          </div>
          <div className="hiw-proof-links">
            <a
              href="https://b2construct.com/blog"
              target="_blank"
              rel="noopener noreferrer"
              className="hiw-proof-link"
            >
              See a kitchen remodeler&apos;s blog
              <span className="hiw-proof-arrow" aria-hidden="true">&rarr;</span>
            </a>
            <a
              href="https://b2construct.com/projects"
              target="_blank"
              rel="noopener noreferrer"
              className="hiw-proof-link"
            >
              Browse real project pages
              <span className="hiw-proof-arrow" aria-hidden="true">&rarr;</span>
            </a>
            <a
              href="https://epicuriouskitchens.com/blog"
              target="_blank"
              rel="noopener noreferrer"
              className="hiw-proof-link"
            >
              Read another subscriber&apos;s content
              <span className="hiw-proof-arrow" aria-hidden="true">&rarr;</span>
            </a>
          </div>
          <div className="hiw-placeholder" style={{ marginTop: 48 }}>
            [PLACEHOLDER: Grid of 4 real content screenshots from different platforms,
            all sourced from the same project]
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">Your Work Deserves to Be Seen</h2>
          <div className="hiw-cta-actions">
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              See What It Costs
            </Link>
            <Link href="/contact" className="mp-btn-outline mp-btn-lg">
              Talk to Us
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: hiwStyles }} />
    </>
  );
}

const hiwStyles = `
  /* Shared section spacing */
  .mp-section { padding: 30px 0; }
  .mp-section-alt { background: #f9fafb; }
  .mp-section-title { font-size: 36px; font-weight: 700; color: #1a1a1a; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 16px; }
  .mp-section-subtitle { font-size: 18px; color: #4b5563; line-height: 1.6; max-width: 640px; margin-bottom: 48px; }
  .mp-text-center { text-align: center; }
  .mp-text-center .mp-section-subtitle { margin-left: auto; margin-right: auto; }

  /* Hero */
  .hiw-hero { padding-top: 80px; }
  .hiw-hero-title {
    font-size: 48px;
    line-height: 1.08;
    letter-spacing: -0.03em;
    text-align: center;
  }
  .hiw-hero-subtitle {
    font-size: 19px;
    color: #4b5563;
    line-height: 1.7;
    text-align: center;
    max-width: 680px;
    margin: 24px auto 48px;
  }
  @media (max-width: 768px) {
    .hiw-hero { padding-top: 48px; }
    .hiw-hero-title { font-size: 32px; }
    .hiw-hero-subtitle { font-size: 16px; }
  }

  /* Step labels */
  .hiw-step-label {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
    margin-bottom: 12px;
  }

  /* Prose blocks */
  .hiw-prose {
    margin-top: 16px;
    margin-bottom: 40px;
  }
  .hiw-prose p {
    font-size: 17px;
    color: #374151;
    line-height: 1.8;
  }

  /* Placeholders */
  .hiw-placeholder {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 64px 32px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
    line-height: 1.6;
  }
  .hiw-placeholder-sm {
    padding: 32px 16px;
    font-size: 12px;
    margin-top: 16px;
  }

  /* Step 3: Platform grid */
  .hiw-platform-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    margin-top: 48px;
  }
  @media (max-width: 768px) {
    .hiw-platform-grid { grid-template-columns: 1fr; }
  }
  .hiw-platform-card {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 28px 24px;
    background: #fff;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .hiw-platform-card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
    transform: translateY(-2px);
  }
  .hiw-platform-name {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 8px;
  }
  .hiw-platform-desc {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.6;
  }
  .hiw-transform-intro {
    font-size: 18px;
    color: #4b5563;
    line-height: 1.6;
    margin-top: 16px;
    max-width: 640px;
    margin-left: auto;
    margin-right: auto;
  }
  .hiw-transform-callout {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin-top: 48px;
    font-style: italic;
  }

  /* The Math: comparison */
  .hiw-comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-top: 48px;
  }
  @media (max-width: 640px) {
    .hiw-comparison { grid-template-columns: 1fr; }
  }
  .hiw-compare-col {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 32px 28px;
  }
  .hiw-compare-manual {
    background: #fafafa;
  }
  .hiw-compare-tracpost {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }
  .hiw-compare-heading {
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 20px;
  }
  .hiw-compare-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hiw-compare-list li {
    font-size: 15px;
    color: #374151;
    line-height: 1.5;
    padding-left: 20px;
    position: relative;
  }
  .hiw-compare-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9ca3af;
  }
  .hiw-compare-tracpost .hiw-compare-list li::before {
    background: #22c55e;
  }
  .hiw-compare-time {
    margin-top: 24px;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
  }
  .hiw-compare-tracpost .hiw-compare-time {
    color: #16a34a;
  }

  /* Real Output: proof links */
  .hiw-proof-links {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-top: 32px;
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }
  .hiw-proof-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    border-bottom: 1px solid #e5e7eb;
    font-size: 16px;
    font-weight: 500;
    color: #1a1a1a;
    text-decoration: none;
    transition: color 0.15s;
  }
  .hiw-proof-link:first-child {
    border-top: 1px solid #e5e7eb;
  }
  .hiw-proof-link:hover {
    color: #4b5563;
  }
  .hiw-proof-arrow {
    font-size: 18px;
    color: #9ca3af;
    transition: transform 0.15s;
  }
  .hiw-proof-link:hover .hiw-proof-arrow {
    transform: translateX(4px);
  }

  /* CTA */
  .hiw-cta-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 32px;
    flex-wrap: wrap;
  }
`;
