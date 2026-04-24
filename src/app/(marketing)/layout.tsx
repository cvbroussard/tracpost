import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-platform/nav";
import { MarketingFooter } from "@/components/marketing-platform/footer";

export const metadata: Metadata = {
  openGraph: {
    title: "TracPost — AI-Powered Content Automation",
    description:
      "Automate your social media content creation and distribution. TracPost turns project updates into polished posts across every platform.",
    type: "website",
    siteName: "TracPost",
    images: [
      {
        url: "https://assets.tracpost.com/marketing/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "TracPost — AI-Powered Content Automation",
      },
    ],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "TracPost",
  url: "https://tracpost.com",
  logo: "https://tracpost.com/icon.png",
  description:
    "AI-powered social content automation for businesses. Turn project updates into polished posts across every platform.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-site">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />

      <style dangerouslySetInnerHTML={{ __html: marketingLayoutStyles }} />
    </div>
  );
}

const marketingLayoutStyles = `
  .marketing-site {
    font-family: var(--font-geist-sans), system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
  }
  .marketing-site main { flex: 1; }
  .marketing-site img { max-width: 100%; display: block; }
`;
