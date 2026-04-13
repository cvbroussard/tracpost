import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

/**
 * Platform-specific profile constraints.
 */
const PLATFORM_PROFILES: Record<string, {
  label: string;
  bioMaxLength: number;
  handlePrefix: string;
  handleMaxLength: number;
  categoryField: string;
  supportsLocation: boolean;
  supportsWebsiteLink: boolean;
  notes: string;
}> = {
  instagram: {
    label: "Instagram",
    bioMaxLength: 150,
    handlePrefix: "@",
    handleMaxLength: 30,
    categoryField: "Category (business)",
    supportsLocation: true,
    supportsWebsiteLink: true,
    notes: "Requires Facebook Page first. Set as Business or Creator account.",
  },
  facebook: {
    label: "Facebook Page",
    bioMaxLength: 101,
    handlePrefix: "",
    handleMaxLength: 50,
    categoryField: "Page Category",
    supportsLocation: true,
    supportsWebsiteLink: true,
    notes: "Create via Meta Business Suite. Add all admins before connecting OAuth.",
  },
  tiktok: {
    label: "TikTok",
    bioMaxLength: 80,
    handlePrefix: "@",
    handleMaxLength: 24,
    categoryField: "Category",
    supportsLocation: false,
    supportsWebsiteLink: true,
    notes: "Business account required for API access. Phone verification needed.",
  },
  youtube: {
    label: "YouTube",
    bioMaxLength: 1000,
    handlePrefix: "@",
    handleMaxLength: 30,
    categoryField: "Channel category",
    supportsLocation: true,
    supportsWebsiteLink: true,
    notes: "Brand channel can be created under existing Google account.",
  },
  twitter: {
    label: "X (Twitter)",
    bioMaxLength: 160,
    handlePrefix: "@",
    handleMaxLength: 15,
    categoryField: "Category",
    supportsLocation: true,
    supportsWebsiteLink: true,
    notes: "Email + phone verification required.",
  },
  linkedin: {
    label: "LinkedIn",
    bioMaxLength: 2000,
    handlePrefix: "",
    handleMaxLength: 50,
    categoryField: "Industry",
    supportsLocation: true,
    supportsWebsiteLink: true,
    notes: "Requires personal LinkedIn account to create Company Page.",
  },
  pinterest: {
    label: "Pinterest",
    bioMaxLength: 500,
    handlePrefix: "",
    handleMaxLength: 30,
    categoryField: "Business type",
    supportsLocation: false,
    supportsWebsiteLink: true,
    notes: "Convert to Business account for analytics + API access.",
  },
  gbp: {
    label: "Google Business Profile",
    bioMaxLength: 750,
    handlePrefix: "",
    handleMaxLength: 0,
    categoryField: "Primary category",
    supportsLocation: true,
    supportsWebsiteLink: true,
    notes: "Business verification required (postcard/phone/video). Can take days.",
  },
};

const ALL_PLATFORMS = [
  "instagram", "facebook", "tiktok", "youtube",
  "gbp", "twitter", "linkedin", "pinterest",
];

export interface PlatformProfile {
  platform: string;
  label: string;
  handle: string;
  bio: string;
  category: string;
  location: string | null;
  websiteLink: string;
  notes: string;
}

export interface ProfileKit {
  siteName: string;
  blogSlug: string;
  hubPageUrl: string;
  handleSuggestions: string[];
  platforms: PlatformProfile[];
  contentPillars: string[];
  brandTone: string;
  tagline: string;
}

/**
 * Generate a complete Profile Kit from playbook + site data.
 * Produces platform-specific bios, handles, categories, and setup notes.
 */
export function generateProfileKit(opts: {
  siteName: string;
  businessType: string;
  location: string;
  blogSlug: string;
  siteUrl?: string | null;
  playbook: BrandPlaybook;
  recommendedPlatforms?: string[];
}): ProfileKit {
  const { siteName, businessType, location, blogSlug, siteUrl, playbook } = opts;

  const angle = playbook.brandPositioning.selectedAngles[0];
  const emotionalCore = playbook.offerCore.offerStatement.emotionalCore;
  const tagline = angle?.tagline || "";
  const tone = angle?.tone || "";
  const themes = angle?.contentThemes || [];
  const desirePhrases = playbook.audienceResearch.languageMap.desirePhrases;
  const hubPageUrl = `https://staging.tracpost.com/${blogSlug}/blog`;
  const websiteLink = siteUrl || hubPageUrl;

  // Generate handle suggestions
  const handleBase = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  const handleDotted = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 25);
  const handleUnder = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 25);

  const handleSuggestions = [...new Set([handleDotted, handleBase, handleUnder])];

  // All platforms — every channel is a discovery surface
  const platforms = opts.recommendedPlatforms || ALL_PLATFORMS;

  // Generate per-platform profiles
  const platformProfiles: PlatformProfile[] = platforms.map((platform) => {
    const config = PLATFORM_PROFILES[platform];
    if (!config) return null;

    const bio = generateBio(platform, config.bioMaxLength, {
      siteName,
      tagline,
      emotionalCore,
      location,
      businessType,
      desirePhrases,
      themes,
    });

    const handle = platform === "gbp" ? siteName : `${config.handlePrefix}${handleDotted}`;
    const category = suggestCategory(platform, businessType);

    return {
      platform,
      label: config.label,
      handle,
      bio,
      category,
      location: config.supportsLocation ? location : null,
      websiteLink: config.supportsWebsiteLink ? websiteLink : "",
      notes: config.notes,
    };
  }).filter(Boolean) as PlatformProfile[];

  return {
    siteName,
    blogSlug,
    hubPageUrl,
    handleSuggestions,
    platforms: platformProfiles,
    contentPillars: themes,
    brandTone: tone,
    tagline,
  };
}

/**
 * Generate a platform-specific bio within character limits.
 */
function generateBio(
  platform: string,
  maxLength: number,
  ctx: {
    siteName: string;
    tagline: string;
    emotionalCore: string;
    location: string;
    businessType: string;
    desirePhrases: string[];
    themes: string[];
  }
): string {
  const { siteName, tagline, emotionalCore, location, businessType, desirePhrases } = ctx;

  // Ultra-short platforms (TikTok: 80, Facebook: 101)
  if (maxLength <= 101) {
    // Try tagline first — it's the most compelling
    if (tagline.length <= maxLength) return tagline;
    // Fall back to name + business type
    const nameBiz = `${siteName} | ${businessType}`;
    if (nameBiz.length <= maxLength) return nameBiz;
    // Last resort
    return `${siteName} | ${location}`.slice(0, maxLength);
  }

  // Short platforms (Instagram: 150, Twitter: 160)
  if (maxLength <= 160) {
    const lines = [
      tagline,
      `${businessType} | ${location}`,
      desirePhrases[0] || "",
    ].filter(Boolean);

    let bio = lines.join("\n");
    if (bio.length > maxLength) {
      bio = `${tagline}\n${businessType} | ${location}`;
    }
    if (bio.length > maxLength) {
      bio = `${siteName} | ${emotionalCore}`.slice(0, maxLength);
    }
    return bio;
  }

  // Medium platforms (Facebook: 255, Pinterest: 500)
  if (maxLength <= 500) {
    return [
      tagline,
      "",
      emotionalCore,
      "",
      `${businessType} serving ${location}.`,
    ].join("\n").slice(0, maxLength);
  }

  // Long platforms (LinkedIn: 2000, YouTube: 1000, GBP: 750)
  return [
    tagline,
    "",
    emotionalCore,
    "",
    `${siteName} is a ${businessType.toLowerCase()} serving ${location}. ` +
    `We specialize in ${desirePhrases.slice(0, 3).join(", ")}.`,
    "",
    ctx.themes.length > 0
      ? `Follow us for: ${ctx.themes.join(" | ")}`
      : "",
  ].filter(Boolean).join("\n").slice(0, maxLength);
}

/**
 * Suggest a platform category based on business type.
 */
function suggestCategory(platform: string, businessType: string): string {
  const bt = businessType.toLowerCase();

  // GBP categories are very specific
  if (platform === "gbp") {
    if (bt.includes("kitchen") || bt.includes("remodel")) return "Kitchen Remodeler";
    if (bt.includes("contractor") || bt.includes("construction")) return "General Contractor";
    if (bt.includes("restaurant") || bt.includes("food")) return "Restaurant";
    if (bt.includes("salon") || bt.includes("beauty")) return "Beauty Salon";
    if (bt.includes("dog") || bt.includes("pet") || bt.includes("training")) return "Dog Trainer";
    return businessType;
  }

  // Facebook/Instagram categories
  if (platform === "facebook" || platform === "instagram") {
    if (bt.includes("kitchen") || bt.includes("remodel")) return "Home Improvement";
    if (bt.includes("contractor") || bt.includes("construction")) return "Contractor";
    if (bt.includes("restaurant") || bt.includes("food")) return "Restaurant";
    if (bt.includes("salon") || bt.includes("beauty")) return "Beauty, Cosmetic & Personal Care";
    if (bt.includes("dog") || bt.includes("pet") || bt.includes("training")) return "Pet Service";
    return "Local Business";
  }

  // LinkedIn industries
  if (platform === "linkedin") {
    if (bt.includes("kitchen") || bt.includes("remodel") || bt.includes("construction")) return "Construction";
    if (bt.includes("restaurant") || bt.includes("food")) return "Food & Beverages";
    if (bt.includes("salon") || bt.includes("beauty")) return "Consumer Services";
    return "Professional Services";
  }

  return businessType;
}

/**
 * Recommend platforms based on business type.
 * Returns platforms in priority order.
 */
export function recommendPlatforms(businessType: string): string[] {
  const bt = businessType.toLowerCase();

  // Visual/luxury businesses → heavy Instagram + Pinterest
  if (bt.includes("kitchen") || bt.includes("remodel") || bt.includes("interior") || bt.includes("design")) {
    return ["instagram", "pinterest", "facebook", "gbp", "youtube", "tiktok"];
  }

  // Construction/contractor → GBP + Facebook + Instagram
  if (bt.includes("contractor") || bt.includes("construction") || bt.includes("plumb") || bt.includes("electric")) {
    return ["gbp", "facebook", "instagram", "youtube", "tiktok"];
  }

  // Food/restaurant → Instagram + TikTok + GBP + Facebook
  if (bt.includes("restaurant") || bt.includes("food") || bt.includes("cafe") || bt.includes("bakery")) {
    return ["instagram", "tiktok", "gbp", "facebook", "youtube"];
  }

  // Pet/training → Instagram + TikTok + YouTube + Facebook
  if (bt.includes("dog") || bt.includes("pet") || bt.includes("training")) {
    return ["instagram", "tiktok", "youtube", "facebook", "gbp"];
  }

  // Salon/beauty → Instagram + TikTok + Pinterest + Facebook
  if (bt.includes("salon") || bt.includes("beauty") || bt.includes("spa")) {
    return ["instagram", "tiktok", "pinterest", "facebook", "gbp"];
  }

  // Default: broad coverage
  return ["instagram", "facebook", "gbp", "tiktok", "youtube", "pinterest"];
}
