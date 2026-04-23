import Image from "next/image";
import type { HomePageData } from "@/lib/tenant-site";

interface Props {
  data: HomePageData;
  prefix: string;
}

/**
 * Home-slot variant: saas_landing
 * Long-form marketing page for SaaS tenants. Hero + how-it-works +
 * feature grid + expected-impact + CTA. Pricing lives on the Work
 * slot (pricing_tiers variant), so this page teases + links there.
 *
 * Hero title/subtitle come from website_copy.home when present;
 * the rest is hardcoded SaaS narrative — tenants adopting this
 * variant should override sections via future website_copy fields.
 */
export default function HomeSaasLanding({ data, prefix }: Props) {
  const heroTitle = data.heroTitle || "From your camera to 8 platforms in minutes";
  const heroSubtitle =
    data.heroSubtitle ||
    "Your managed content engine. Capture photos of your work — we handle the brand strategy, captions, publishing, blog, and SEO. Automatically.";

  return (
    <>
      <section className="ws-saas-hero">
        <div className="ws-container ws-saas-hero-inner">
          <h1 className="ws-saas-hero-title">{heroTitle}</h1>
          <p className="ws-saas-hero-subtitle">{heroSubtitle}</p>
          <div className="ws-saas-hero-actions">
            <a href={`${prefix}/work`} className="ws-btn ws-btn-primary">
              Start 14-day free trial
            </a>
            <a href="#how" className="ws-btn ws-btn-outline">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section id="how" className="ws-saas-section">
        <div className="ws-container">
          <h2 className="ws-saas-section-title">You capture. We do everything else.</h2>
          <div className="ws-saas-steps">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.n} className="ws-saas-step">
                <p className="ws-saas-step-n">{step.n}</p>
                <h3 className="ws-saas-step-title">{step.title}</h3>
                <p className="ws-saas-step-body">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ws-saas-section ws-saas-section-alt">
        <div className="ws-container">
          <h2 className="ws-saas-section-title">A marketing department that runs on autopilot</h2>
          <div className="ws-saas-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="ws-saas-feature">
                <h3 className="ws-saas-feature-title">{f.title}</h3>
                <p className="ws-saas-feature-body">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.recentArticles.length > 0 && (
        <section className="ws-saas-section">
          <div className="ws-container">
            <h2 className="ws-saas-section-title">Recent case studies</h2>
            <div className="ws-saas-articles">
              {data.recentArticles.map((a) => (
                <a key={a.slug} href={`${prefix}/blog/${a.slug}`} className="ws-saas-article">
                  {a.image && <Image src={a.image} alt={a.title} className="ws-saas-article-img" width={640} height={360} sizes="(max-width: 768px) 100vw, 33vw" quality={75} />}
                  <div className="ws-saas-article-body">
                    {a.date && <p className="ws-saas-article-date">{a.date}</p>}
                    <h3 className="ws-saas-article-title">{a.title}</h3>
                    {a.excerpt && <p className="ws-saas-article-excerpt">{a.excerpt}</p>}
                  </div>
                </a>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <a href={`${prefix}/blog`} className="ws-btn ws-btn-outline">
                Read the blog
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="ws-saas-section ws-saas-section-alt">
        <div className="ws-container">
          <h2 className="ws-saas-section-title">What to expect</h2>
          <div className="ws-saas-impact">
            <div>
              <h3 className="ws-saas-impact-title">Growth</h3>
              <p className="ws-saas-impact-body">
                Google starts recognizing you as a subject-matter authority in four areas.
                Your blog drives organic traffic within 60–90 days. Character-driven content
                builds trust before the first phone call.
              </p>
            </div>
            <div>
              <h3 className="ws-saas-impact-title">Authority</h3>
              <p className="ws-saas-impact-body">
                You become the most-published, most-indexed business in your niche locally.
                Every search query related to your service finds your content. Domain authority
                compounds — the longer you run, the harder you are to displace.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="ws-saas-section ws-saas-cta">
        <div className="ws-container" style={{ textAlign: "center" }}>
          <h2 className="ws-saas-section-title" style={{ marginBottom: 16 }}>
            Ready to let the engine run?
          </h2>
          <p style={{ maxWidth: 560, margin: "0 auto 32px", color: "var(--ws-muted)", fontSize: 17, lineHeight: 1.6 }}>
            Pick a plan, set up your accounts once, then shoot photos the same way you already do.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={`${prefix}/work`} className="ws-btn ws-btn-primary">
              See pricing
            </a>
            <a href={`${prefix}/contact`} className="ws-btn ws-btn-outline">
              Talk to us
            </a>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: saasStyles }} />
    </>
  );
}

const HOW_IT_WORKS = [
  {
    n: "1",
    title: "Capture",
    body:
      "Take photos and videos of your work with TracPost Studio on your phone. Add a quick note about what's happening.",
  },
  {
    n: "2",
    title: "Pipeline",
    body:
      "AI evaluates your content, writes platform-specific captions, generates blog posts, and schedules across Instagram, TikTok, Facebook, X, YouTube, Pinterest, LinkedIn, and Google Business.",
  },
  {
    n: "3",
    title: "Results",
    body:
      "Your social accounts stay active, your blog ranks on Google, and clients find you when they search for what you do. You focus on your craft.",
  },
];

const FEATURES = [
  {
    title: "8-Platform Publishing",
    desc:
      "Instagram, TikTok, Facebook, X, YouTube, Pinterest, LinkedIn, Google Business — all managed from one capture.",
  },
  {
    title: "Brand Intelligence",
    desc:
      "AI researches your market, builds your brand playbook, and generates content that sounds like you — not a robot.",
  },
  {
    title: "Blog & SEO Engine",
    desc:
      "Auto-generated blog posts with inline images, authority links, and schema markup. Your own SEO-optimized microsite.",
  },
  {
    title: "Cast of Characters",
    desc:
      "AI recognizes recurring subjects in your photos and weaves their stories into your content. Every post builds a narrative.",
  },
  {
    title: "Mobile Capture App",
    desc:
      "TracPost Studio on your iPhone. Snap photos at work, add context, upload. The pipeline does the rest in minutes.",
  },
  {
    title: "Managed Accounts",
    desc:
      "We create and optimize your social profiles. You don't need to know the difference between a Business Account and a Page.",
  },
];

const saasStyles = `
  .ws-saas-hero {
    padding: 120px 0 80px;
    text-align: center;
    border-bottom: 1px solid var(--ws-border);
  }
  .ws-saas-hero-inner { max-width: 780px; margin: 0 auto; }
  .ws-saas-hero-title {
    font-family: var(--ws-heading-font);
    font-size: 56px;
    font-weight: 700;
    color: var(--ws-primary);
    line-height: 1.05;
    letter-spacing: -0.03em;
    margin-bottom: 24px;
  }
  .ws-saas-hero-subtitle {
    font-size: 20px;
    color: var(--ws-muted);
    line-height: 1.6;
    max-width: 620px;
    margin: 0 auto 36px;
  }
  .ws-saas-hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  @media (max-width: 768px) {
    .ws-saas-hero { padding: 72px 0 48px; }
    .ws-saas-hero-title { font-size: 36px; }
    .ws-saas-hero-subtitle { font-size: 17px; }
  }

  .ws-saas-section { padding: 96px 0; border-top: 1px solid var(--ws-border); }
  .ws-saas-section-alt {
    background: color-mix(in srgb, var(--ws-primary) 3%, var(--ws-bg));
  }
  .ws-saas-section-title {
    font-family: var(--ws-heading-font);
    font-size: 32px;
    font-weight: 600;
    color: var(--ws-primary);
    text-align: center;
    margin-bottom: 56px;
    letter-spacing: -0.02em;
  }

  .ws-saas-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; }
  @media (max-width: 768px) { .ws-saas-steps { grid-template-columns: 1fr; gap: 32px; } }
  .ws-saas-step-n {
    font-family: var(--ws-heading-font);
    font-size: 32px;
    color: var(--ws-accent);
    margin-bottom: 12px;
  }
  .ws-saas-step-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }
  .ws-saas-step-body { color: var(--ws-muted); line-height: 1.6; font-size: 15px; }

  .ws-saas-features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; }
  @media (max-width: 768px) { .ws-saas-features { grid-template-columns: 1fr; } }
  .ws-saas-feature-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }
  .ws-saas-feature-body { color: var(--ws-muted); line-height: 1.6; font-size: 15px; }

  .ws-saas-articles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 768px) { .ws-saas-articles { grid-template-columns: 1fr; } }
  .ws-saas-article {
    display: block;
    text-decoration: none;
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .ws-saas-article:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }
  .ws-saas-article-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .ws-saas-article-body { padding: 20px; }
  .ws-saas-article-date {
    font-size: 12px;
    color: var(--ws-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }
  .ws-saas-article-title {
    font-family: var(--ws-heading-font);
    font-size: 17px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .ws-saas-article-excerpt { font-size: 14px; color: var(--ws-muted); line-height: 1.5; }

  .ws-saas-impact {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 40px;
    max-width: 820px;
    margin: 0 auto;
  }
  @media (max-width: 768px) { .ws-saas-impact { grid-template-columns: 1fr; } }
  .ws-saas-impact-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }
  .ws-saas-impact-body { color: var(--ws-muted); line-height: 1.6; font-size: 15px; }
`;
