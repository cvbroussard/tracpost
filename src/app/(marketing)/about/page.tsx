import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — TracPost",
  description: "TracPost is an AI-powered content automation platform built in Pittsburgh. We turn phone photos into published content across 8 platforms.",
};

export default function AboutPage() {
  return (
    <>
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 720 }}>
          <h1 className="mp-section-title" style={{ fontSize: 44 }}>
            Built by people who got tired of doing it the old way.
          </h1>

          <div className="mp-about-body">
            <p>
              TracPost started with a construction company. The owner took great photos
              of his work — kitchens, renovations, custom builds — but posting them was
              always the last priority. The photos sat in the camera roll. The blog
              hadn&apos;t been updated in a year. The Google Business Profile was stale.
              Meanwhile, competitors with worse work were showing up everywhere online
              because they had someone doing marketing.
            </p>
            <p>
              So we built the marketing team that runs itself.
            </p>
            <p>
              TracPost takes the photos you&apos;re already capturing on your phone and turns
              them into captions, blog posts, social content, and SEO-optimized web pages —
              published across Instagram, TikTok, Facebook, X, YouTube, Pinterest, LinkedIn,
              and Google Business. All automatically. All in your brand voice. All while
              you&apos;re focused on the work you actually do.
            </p>
            <p>
              The AI doesn&apos;t write generic content. It builds a brand playbook specific
              to your business — your market, your voice, your differentiators — and every
              piece of content is shaped by that playbook. The more you capture, the sharper
              it gets.
            </p>
            <p>
              We&apos;re based in Pittsburgh. We build for contractors, remodelers, designers,
              restaurants, salons, coaches, and agencies — businesses where the quality of
              the work speaks for itself, if someone would just help it get seen.
            </p>
            <p>
              That&apos;s what TracPost does. You do the work. We make sure the world sees it.
            </p>
          </div>

          <div className="mp-about-cta">
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              Start 7-day trial
            </Link>
            <Link href="/contact" className="mp-btn-outline mp-btn-lg">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <section className="mp-section mp-section-alt">
        <div className="mp-container" style={{ maxWidth: 720 }}>
          <h2 className="mp-section-title">Principles</h2>
          <div className="mp-about-principles">
            <div>
              <h3>Your voice, not ours.</h3>
              <p>
                The AI learns how you talk about your work — the imperfections, the industry
                language, the specific way you describe what you do. That&apos;s the brand voice.
                We never polish it out.
              </p>
            </div>
            <div>
              <h3>Platform builds, you validate.</h3>
              <p>
                We handle the strategy, the writing, the scheduling, the SEO. You approve
                what goes out. No learning curve, no dashboard training, no 40-page onboarding
                guide.
              </p>
            </div>
            <div>
              <h3>Results you can see.</h3>
              <p>
                Every article, every social post, every Google update is visible to you in one
                place. You know exactly what&apos;s publishing and what it&apos;s doing for your business.
              </p>
            </div>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: aboutStyles }} />
    </>
  );
}

const aboutStyles = `
  .mp-about-body {
    margin-top: 40px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .mp-about-body p {
    font-size: 17px;
    color: #374151;
    line-height: 1.8;
  }
  .mp-about-cta {
    display: flex;
    gap: 12px;
    margin-top: 48px;
  }

  .mp-about-principles {
    display: flex;
    flex-direction: column;
    gap: 32px;
    margin-top: 32px;
  }
  .mp-about-principles h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 8px;
  }
  .mp-about-principles p {
    font-size: 15px;
    color: #6b7280;
    line-height: 1.6;
  }
`;
