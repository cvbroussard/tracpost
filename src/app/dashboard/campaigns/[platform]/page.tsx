import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ platform: string }>;
}

const PLATFORM_LABELS: Record<string, { name: string; eta: string; pitch: string }> = {
  google: {
    name: "Google",
    eta: "Q3 2026",
    pitch: "Google Search & Performance Max — boost your top organic content into Google Ads campaigns alongside your Meta and other platform spend.",
  },
  tiktok: {
    name: "TikTok",
    eta: "Q4 2026",
    pitch: "TikTok Ads Manager integration — promote your top organic Reels and Spark Ads from TracPost into your TikTok ad campaigns.",
  },
  pinterest: {
    name: "Pinterest",
    eta: "Q4 2026",
    pitch: "Pinterest Ads — boost your highest-engagement pins into existing Pinterest campaigns from one unified surface.",
  },
  linkedin: {
    name: "LinkedIn",
    eta: "2027",
    pitch: "LinkedIn Sponsored Content — for service businesses targeting commercial clients and referral partners on LinkedIn.",
  },
};

export default async function PromotePlatformPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");
  if (!session.plan.toLowerCase().includes("enterprise")) redirect("/dashboard");

  const { platform } = await params;
  const meta = PLATFORM_LABELS[platform];
  if (!meta) notFound();

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-medium">Promote on {meta.name}</h2>
        <p className="text-xs text-muted">Cross-promote your best organic content into your existing {meta.name} campaigns</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg border border-border bg-background shrink-0">
            <span className="text-xs font-medium text-muted">Soon</span>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium mb-1">{meta.name} integration — coming {meta.eta}</h3>
            <p className="text-sm text-muted leading-relaxed mb-3">
              {meta.pitch}
            </p>
            <p className="text-xs text-muted leading-relaxed">
              TracPost&apos;s strategy is platform-agnostic at the read layer (campaign monitoring, performance comparison, attribution rollup) and minimal-write at the action layer (boosting top-engagement organic content into existing campaigns). Each platform integration follows the same pattern as Meta — connect your ad account via OAuth, TracPost surfaces your campaigns and lets you promote winning organic posts into them.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-muted">
        Currently available: Meta (Facebook + Instagram). Other platforms surface as roadmap visibility.
      </p>
    </div>
  );
}
