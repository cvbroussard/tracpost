import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const INDUSTRIES: Record<string, {
  title: string;
  headline: string;
  subtitle: string;
  pain: string;
  outcome: string;
  exampleCapture: string;
  exampleOutput: string;
}> = {
  contractors: {
    title: "TracPost for Contractors",
    headline: "Your crew builds it. TracPost publishes it.",
    subtitle: "General contractors, specialty trades, and builders — if you document your work on your phone, TracPost turns it into marketing that ranks on Google.",
    pain: "You finish a beautiful job. You take a photo. It sits in your camera roll for 6 months. Meanwhile, the GC down the road is showing up on every Google search because they have a blog and active social accounts.",
    outcome: "TracPost takes that same phone photo and publishes it across 8 platforms, writes a blog post optimized for your local market, and keeps your Google Business Profile active — all before you get home from the job site.",
    exampleCapture: "Snap a photo of the finished framing, add a voice note: 'second floor addition, steel beam install, 24-foot span'",
    exampleOutput: "Blog post: 'Why Steel Beam Framing Matters for Open-Concept Second-Story Additions' + Instagram carousel + Google Business update + Facebook post",
  },
  "kitchen-bath": {
    title: "TracPost for Kitchen & Bath",
    headline: "Every tile, every fixture, every finish — published.",
    subtitle: "Kitchen and bathroom remodelers generate stunning before-and-after content every week. TracPost makes sure the world sees it.",
    pain: "Your portfolio lives in a photo album you show at consultations. Your competitors have 50 blog posts ranking for 'kitchen remodel' in your city. Their work isn't better — their marketing is.",
    outcome: "TracPost watches your project unfold through the photos you capture. It writes the story of each renovation, tags the materials and vendors, and publishes across every platform where homeowners search.",
    exampleCapture: "Photo of zellige backsplash going up, voice note: 'zellige from Zia Tile, floating walnut shelves, Thermador fridge behind plastic still'",
    exampleOutput: "Blog post: 'Zellige Tile Backsplash: Why Pittsburgh Designers Are Choosing Handmade Over Subway' + project case study + Pinterest pins + Google Business update",
  },
  "interior-design": {
    title: "TracPost for Interior Designers",
    headline: "Design the space. We'll design the content.",
    subtitle: "Interior designers live on visual storytelling. TracPost makes every project a published portfolio piece without you writing a word.",
    pain: "You spend hours staging and photographing. Then the photos sit in Dropbox while you move to the next project. Your website portfolio is 2 years out of date.",
    outcome: "Every project photo becomes a blog post, a social series, and a Google-ranked case study. Your portfolio updates itself. Your brand voice stays consistent across every platform.",
    exampleCapture: "Photo of completed living room, voice note: 'Restoration Hardware sofa, custom drapery by Thibaut, Benjamin Moore Revere Pewter walls'",
    exampleOutput: "Blog post: 'Layering Textures in a Transitional Living Room' + Instagram story + LinkedIn article + Pinterest board",
  },
  "real-estate": {
    title: "TracPost for Real Estate",
    headline: "List it. Photograph it. We market it everywhere.",
    subtitle: "Real estate agents juggle dozens of listings. TracPost turns every property photo into content that drives leads across every platform.",
    pain: "You take 40 photos per listing. They go on the MLS. Maybe you post one on Instagram. Your broker's marketing package is a template everyone else uses too.",
    outcome: "TracPost takes your listing photos and creates unique content for each property — blog posts about the neighborhood, social posts highlighting features, Google Business updates for local search visibility.",
    exampleCapture: "Photo of kitchen, voice note: 'renovated 2024, quartz counters, gas range, open to living'",
    exampleOutput: "Blog post: 'Inside a Recently Renovated Kitchen in Shadyside' + neighborhood guide + Instagram carousel + Facebook listing post",
  },
  restaurants: {
    title: "TracPost for Restaurants",
    headline: "Cook the food. Plate the photo. We do the rest.",
    subtitle: "Restaurants live on visual appeal and local search. TracPost turns your daily specials and plating photos into a marketing engine.",
    pain: "You post when you remember. Your social feels inconsistent. Yelp and Google reviews drive most of your traffic, but your blog and social presence don't reinforce them.",
    outcome: "Snap a photo of today's special. TracPost writes the caption, posts it across 8 platforms, updates your Google Business Profile, and writes a blog post about your seasonal menu — before the dinner rush starts.",
    exampleCapture: "Photo of plated dish, voice note: 'pan-seared halibut, spring pea purée, crispy shallots, new spring menu'",
    exampleOutput: "Blog post: 'Spring Menu Spotlight: Pan-Seared Halibut with Pea Purée' + Instagram + TikTok + Google Business + Facebook",
  },
  salons: {
    title: "TracPost for Salons & Spas",
    headline: "Style it. Snap it. Published.",
    subtitle: "Salons and spas produce visual content every chair, every day. TracPost turns your client transformations into marketing that fills your book.",
    pain: "You take before-and-after photos for every client. They go in a folder. Meanwhile, the salon across town is showing up in every 'balayage near me' Google search because they blog consistently.",
    outcome: "TracPost publishes your transformations across social, writes SEO-optimized blog posts about your techniques, and keeps your Google Business Profile active with fresh content.",
    exampleCapture: "Photo of finished balayage, voice note: 'balayage, lived-in blonde, Olaplex treatment, 3 hours'",
    exampleOutput: "Blog post: 'Lived-In Blonde Balayage: What to Expect' + Instagram before/after + Google Business update + Pinterest",
  },
  coaches: {
    title: "TracPost for Coaches",
    headline: "Share your method. We publish the proof.",
    subtitle: "Coaches, consultants, and advisors — your expertise is your product. TracPost turns your insights into a published thought-leadership presence.",
    pain: "You know you should be writing. LinkedIn posts, blog articles, a newsletter. But you're busy coaching. The writing never happens consistently.",
    outcome: "Record a voice note after a session with a key insight. TracPost writes the article, publishes the LinkedIn post, schedules the social content, and builds your SEO presence — all from a 30-second dictation.",
    exampleCapture: "Voice note: 'had a breakthrough session today, client realized their pricing was anchored to competitor rates instead of value delivered'",
    exampleOutput: "Blog post: 'Why Value-Based Pricing Beats Competitive Pricing for Service Businesses' + LinkedIn article + X thread + newsletter draft",
  },
  agencies: {
    title: "TracPost for Agencies",
    headline: "Manage 10 clients. Publish for all of them.",
    subtitle: "Marketing agencies managing multiple clients need consistent, differentiated content at scale. TracPost builds a separate brand playbook for each client.",
    pain: "Every client needs unique content in their own voice. Your team spends more time writing captions than thinking strategically. Client content starts to blur together.",
    outcome: "Each client gets their own AI brand playbook, their own voice, their own publishing schedule. Your team focuses on strategy. TracPost handles the production line.",
    exampleCapture: "Upload client's project photos, tag with client brand, voice note: 'Johnson kitchen, custom island, waterfall edge, client ecstatic'",
    exampleOutput: "Client-voiced blog post + 8-platform social + case study for their portfolio + Google Business update — all in the client's unique brand voice, not yours",
  },
};

interface Props {
  params: Promise<{ industry: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry } = await params;
  const data = INDUSTRIES[industry];
  if (!data) return {};
  return {
    title: data.title,
    description: data.subtitle,
    alternates: {
      canonical: `https://tracpost.com/for/${industry}`,
    },
  };
}

export async function generateStaticParams() {
  return Object.keys(INDUSTRIES).map((industry) => ({ industry }));
}

export default async function IndustryPage({ params }: Props) {
  const { industry } = await params;
  const data = INDUSTRIES[industry];
  if (!data) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://tracpost.com" },
      { "@type": "ListItem", position: 2, name: data.title },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 780 }}>
          <h1 className="mp-section-title" style={{ fontSize: 44 }}>{data.headline}</h1>
          <p className="mp-section-subtitle" style={{ maxWidth: "none", marginBottom: 48 }}>
            {data.subtitle}
          </p>

          <div className="mp-ind-block">
            <h3 className="mp-ind-label">The problem</h3>
            <p className="mp-ind-body">{data.pain}</p>
          </div>

          <div className="mp-ind-block">
            <h3 className="mp-ind-label">How TracPost solves it</h3>
            <p className="mp-ind-body">{data.outcome}</p>
          </div>

          <div className="mp-ind-example">
            <div className="mp-ind-example-col">
              <h4 className="mp-ind-example-label">You capture</h4>
              <p className="mp-ind-example-text">{data.exampleCapture}</p>
            </div>
            <div className="mp-ind-example-arrow">→</div>
            <div className="mp-ind-example-col">
              <h4 className="mp-ind-example-label">TracPost publishes</h4>
              <p className="mp-ind-example-text">{data.exampleOutput}</p>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              Start 7-day trial
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: indStyles }} />
    </>
  );
}

const indStyles = `
  .mp-ind-block { margin-bottom: 40px; }
  .mp-ind-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ca3af;
    margin-bottom: 12px;
  }
  .mp-ind-body { font-size: 17px; color: #374151; line-height: 1.7; }

  .mp-ind-example {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 24px;
    align-items: start;
    padding: 32px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fafafa;
    margin-top: 40px;
  }
  @media (max-width: 640px) {
    .mp-ind-example { grid-template-columns: 1fr; }
    .mp-ind-example-arrow { text-align: center; }
  }
  .mp-ind-example-arrow {
    font-size: 24px;
    color: #d1d5db;
    padding-top: 24px;
  }
  .mp-ind-example-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ca3af;
    margin-bottom: 8px;
  }
  .mp-ind-example-text {
    font-size: 14px;
    color: #374151;
    line-height: 1.6;
    font-style: italic;
  }
`;
