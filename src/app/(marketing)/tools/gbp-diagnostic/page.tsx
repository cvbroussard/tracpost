import type { Metadata } from "next";
import { GbpDiagnosticTool } from "@/components/marketing-platform/gbp-diagnostic";

export const metadata: Metadata = {
  title: "Free GBP Category Diagnostic — TracPost",
  description: "Find out which Google Business Profile categories fit your business. Free, instant, no signup required.",
};

export default function GbpDiagnosticPage() {
  return (
    <>
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 780 }}>
          <h1 className="mp-section-title" style={{ fontSize: 44 }}>
            Which GBP categories fit your business?
          </h1>
          <p className="mp-section-subtitle" style={{ maxWidth: "none", marginBottom: 48 }}>
            Google Business Profile categories drive how you show up in local search.
            Most businesses pick one and forget. The right combination of primary +
            additional categories can surface you for searches your competitors miss.
          </p>

          <GbpDiagnosticTool />

          <div className="mp-gbp-info">
            <h3>What is this?</h3>
            <p>
              TracPost&apos;s category intelligence engine analyzes your business type and
              matches it against Google&apos;s official category taxonomy. You get a primary
              category recommendation plus up to 4 additional categories — each with a
              one-sentence explanation of why it fits.
            </p>
            <h3>No signup required</h3>
            <p>
              This tool is free. No email, no account, no strings. If you want TracPost
              to manage your content and local SEO automatically, that&apos;s a separate conversation.
            </p>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: gbpStyles }} />
    </>
  );
}

const gbpStyles = `
  .mp-gbp-info {
    margin-top: 64px;
    padding-top: 48px;
    border-top: 1px solid #e5e7eb;
  }
  .mp-gbp-info h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 8px;
    margin-top: 24px;
  }
  .mp-gbp-info h3:first-child { margin-top: 0; }
  .mp-gbp-info p {
    font-size: 15px;
    color: #4b5563;
    line-height: 1.6;
  }
`;
