"use client";

import { useState } from "react";
import { OverviewTab } from "./tabs/overview";
import { ContentTab } from "./tabs/content";
import { VisualTab } from "./tabs/visual";
import { PublishingTab } from "./tabs/publishing";
import { WebsiteTab } from "./tabs/website";
import { ActionsTab } from "./tabs/actions";
import type { PageConfig, WorkContent } from "@/lib/tenant-site";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "content", label: "Content" },
  { key: "visual", label: "Visual" },
  { key: "publishing", label: "Publishing" },
  { key: "website", label: "Website" },
  { key: "actions", label: "Actions" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export interface SiteData {
  name: string;
  url: string | null;
  businessType: string;
  location: string;
  contentVibe: string;
  imageStyle: string;
  imageVariations: string[];
  imageProcessingMode: string;
  autopilotEnabled: boolean;
  cadenceConfig: Record<string, number>;
  blogEnabled: boolean;
  blogTitle: string;
  subdomain: string;
  videoRatio: string;
  inlineUploadCount: number;
  inlineAiCount: number;
  blogCadence: number;
  articleMix: string;
  customDomain: string | null;
}

export interface Counts {
  totalAssets: number;
  uploads: number;
  aiAssets: number;
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  vendors: number;
  projects: number;
  personas: number;
  locations: number;
  corrections: number;
  rewardPrompts: number;
  projectPrompts: number;
}

export interface Platform {
  platform: string;
  account_name: string;
  status: string;
}

export interface DomainInfo {
  status: "unknown" | "pending" | "active";
  wwwStatus: "unknown" | "pending" | "active";
  dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }>;
}

export interface HeroAsset {
  id: string;
  storage_url: string;
  context_note: string | null;
  quality_score: number | null;
}

export interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
}

export interface RewardPrompt {
  category: string;
  scene: string;
  prompt: string;
  visual: string;
}

interface SiteTabsProps {
  siteId: string;
  site: SiteData;
  counts: Counts;
  platforms: Platform[];
  rewardPrompts: RewardPrompt[];
  projects: ProjectInfo[];
  navLinks: Array<{ label: string; href: string }>;
  domainInfo: DomainInfo | null;
  pageConfig: PageConfig;
  heroAssetCandidates: HeroAsset[];
  currentHeroAssetId: string | null;
  hasWebsiteCopy: boolean;
  workContent: WorkContent;
}

export function SiteTabs(props: SiteTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          siteId={props.siteId}
          site={props.site}
          counts={props.counts}
          platforms={props.platforms}
        />
      )}
      {activeTab === "content" && (
        <ContentTab
          siteId={props.siteId}
          site={props.site}
          counts={props.counts}
          rewardPrompts={props.rewardPrompts}
          projects={props.projects}
        />
      )}
      {activeTab === "visual" && (
        <VisualTab
          siteId={props.siteId}
          site={props.site}
          heroAssetCandidates={props.heroAssetCandidates}
          currentHeroAssetId={props.currentHeroAssetId}
        />
      )}
      {activeTab === "publishing" && (
        <PublishingTab
          siteId={props.siteId}
          site={props.site}
          platforms={props.platforms}
        />
      )}
      {activeTab === "website" && (
        <WebsiteTab
          siteId={props.siteId}
          site={props.site}
          domainInfo={props.domainInfo}
          pageConfig={props.pageConfig}
          hasWebsiteCopy={props.hasWebsiteCopy}
          workContent={props.workContent}
          heroAssetCandidates={props.heroAssetCandidates}
          currentHeroAssetId={props.currentHeroAssetId}
        />
      )}
      {activeTab === "actions" && (
        <ActionsTab
          siteId={props.siteId}
          counts={props.counts}
        />
      )}
    </div>
  );
}
