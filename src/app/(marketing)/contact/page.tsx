import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact — TracPost",
  description: "Get in touch with TracPost. Start a trial, ask about enterprise plans, or schedule a walkthrough.",
};

export default function ContactPage() {
  return (
    <>
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 640 }}>
          <h1 className="mp-section-title" style={{ fontSize: 44 }}>
            Let&apos;s talk about your content.
          </h1>
          <p className="mp-section-subtitle" style={{ maxWidth: "none", marginBottom: 48 }}>
            Tell us a little about your business and what you&apos;re trying to accomplish.
            We&apos;ll point you at the right plan or walk you through the platform.
          </p>

          <div className="mp-contact-channels">
            <div className="mp-contact-channel">
              <span className="mp-contact-label">Email</span>
              <a href="mailto:hello@tracpost.com" className="mp-contact-value">
                hello@tracpost.com
              </a>
            </div>
            <div className="mp-contact-channel">
              <span className="mp-contact-label">For enterprise or agency inquiries</span>
              <a href="mailto:sales@tracpost.com" className="mp-contact-value">
                sales@tracpost.com
              </a>
            </div>
            <div className="mp-contact-channel">
              <span className="mp-contact-label">Support</span>
              <a href="mailto:support@tracpost.com" className="mp-contact-value">
                support@tracpost.com
              </a>
            </div>
            <div className="mp-contact-channel">
              <span className="mp-contact-label">Based in</span>
              <span className="mp-contact-value">Pittsburgh, PA</span>
            </div>
          </div>

          <div className="mp-contact-cta">
            <p className="mp-contact-cta-text">
              Ready to start? You don&apos;t need to talk to us first.
            </p>
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              Start 14-day trial
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: contactStyles }} />
    </>
  );
}

const contactStyles = `
  .mp-contact-channels {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .mp-contact-channel {
    padding: 20px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .mp-contact-channel:last-child { border-bottom: none; }
  .mp-contact-label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9ca3af;
    margin-bottom: 6px;
  }
  .mp-contact-value {
    font-size: 20px;
    color: #1a1a1a;
    text-decoration: none;
    font-weight: 500;
  }
  a.mp-contact-value:hover { color: #6b7280; }

  .mp-contact-cta {
    margin-top: 56px;
    padding-top: 40px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
  }
  .mp-contact-cta-text {
    font-size: 15px;
    color: #6b7280;
    margin-bottom: 20px;
  }
`;
