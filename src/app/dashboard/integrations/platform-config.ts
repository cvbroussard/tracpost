export interface PlatformConfig {
  key: string;
  label: string;
  slug: string;
  color: string;
  why: string;
  accountType: string;
  prerequisites: string[];
  whatWeDoWithIt: string[];
  oauthRoute: string;
  oauthReady: boolean;
  helpLinks: { label: string; href: string }[];
  multiAssetWarning?: string;
  /** When set, the tile in the connections hub links to this slug instead of its own detail page */
  hubTargetSlug?: string;
  /**
   * Discriminator for the Integrations hub grouping:
   *   - "publishing" (default) — organic publishing connections, all tiers
   *   - "ads" — paid ads/marketing connections, enterprise tier only
   */
  category?: "publishing" | "ads";
  /** Tier gate. Default = visible to all tiers. */
  tierRequired?: "enterprise";
}

export const PLATFORMS: PlatformConfig[] = [
  {
    key: "instagram",
    label: "Instagram",
    slug: "instagram",
    color: "#E1306C",
    why: "Instagram is where your work gets discovered visually. Connected directly through Instagram — your IG Business account authorizes TracPost on its own, independent of Facebook.",
    accountType: "Instagram Business or Creator account linked to a Facebook Page",
    prerequisites: [
      "An Instagram Business or Creator account for this business (personal accounts will need to be converted)",
      "A Facebook Page linked to the Instagram account (a Meta requirement, not TracPost)",
      "Decide which Instagram account belongs to this business — you'll select it during the connection step",
    ],
    whatWeDoWithIt: [
      "Post photos, carousels, and Reels on your behalf",
      "Apply Instagram-native formatting and hashtag strategy",
      "Track engagement and adjust content mix automatically",
    ],
    oauthRoute: "/api/auth/visual-ig",
    oauthReady: true,
    helpLinks: [
      { label: "Convert to Business Account", href: "https://help.instagram.com/502981923235522" },
      { label: "Link Instagram to Facebook Page", href: "https://help.instagram.com/570895513091465" },
    ],
  },
  {
    key: "facebook",
    label: "Facebook",
    slug: "facebook",
    color: "#1877F2",
    why: "Facebook Pages are the most trusted local presence — the first thing customers find when they search your business name.",
    accountType: "Facebook Page (not a personal profile)",
    prerequisites: [
      "You'll connect using your personal Facebook profile (Meta's OAuth always runs against a personal account).",
      "During the connection process, you'll be required to select a Business Page — often shown as a Page with 'business' in parentheses.",
      "Your personal profile must have an admin role on the Page.",
      "The Page must be in Published state (not draft).",
      "One business = one Page. Pick only the Page for this business — don't opt into 'all current and future Pages'.",
    ],
    whatWeDoWithIt: [
      "Publish posts, photos, and link shares to the connected Page",
      "Track engagement and inbound comments via the unified inbox",
      "Read Page-level insights to inform publishing strategy",
    ],
    oauthRoute: "/api/auth/instagram",
    oauthReady: true,
    helpLinks: [
      { label: "Create a Facebook Page", href: "https://www.facebook.com/pages/create" },
      { label: "Page Roles and Permissions", href: "https://www.facebook.com/help/187316341316631" },
    ],
  },
  {
    key: "meta",
    label: "Meta (Facebook + Instagram)",
    slug: "meta",
    color: "#1877F2",
    why: "Facebook Pages are still the most trusted local presence — often the first thing customers find when they search your business name. Instagram is where your work gets discovered visually. Both run on a single Meta authorization, so connecting one connects the other.",
    accountType: "Facebook Page with a linked Instagram Business or Creator account",
    prerequisites: [
      "A Facebook Page for your business (not your personal profile)",
      "An Instagram Business or Creator account linked to the Facebook Page",
      "Admin role on the Page",
      "Page must be published (not in draft state)",
    ],
    whatWeDoWithIt: [
      "Publish posts, photos, carousels, and Reels to both platforms",
      "Format content natively for each platform's audience",
      "Apply hashtag and timing strategy per platform",
      "Monitor engagement across both Page and Instagram account",
      "Coordinate cross-platform reach from a single content source",
    ],
    oauthRoute: "/api/auth/instagram",
    oauthReady: true,
    helpLinks: [
      { label: "Create a Facebook Page", href: "https://www.facebook.com/pages/create" },
      { label: "Convert Instagram to Business Account", href: "https://help.instagram.com/502981923235522" },
      { label: "Link Instagram to Facebook Page", href: "https://help.instagram.com/570895513091465" },
      { label: "Page Roles and Permissions", href: "https://www.facebook.com/help/187316341316631" },
    ],
    multiAssetWarning: "When Meta shows the asset picker, choose 'Opt in to all current and future Pages and Instagram accounts.' This is the simplest path — it covers everything you manage today and any business you add later, with no need to reconnect.",
  },
  {
    key: "gbp",
    label: "Google Business Profile",
    slug: "google-business",
    color: "#4285F4",
    why: "Your Google Business Profile is your most important local search asset. It controls what shows up when someone searches your name, reads your reviews, or looks for services you offer. An optimized profile with regular posts and photos ranks higher in local results.",
    accountType: "Google Business Profile with verified ownership",
    prerequisites: [
      "A Google account with access to your Business Profile",
      "Verified ownership of the business listing",
      "If you have multiple locations, know which one to connect",
    ],
    whatWeDoWithIt: [
      "Publish GBP posts with photos to keep your profile active",
      "Sync your best project photos to the GBP photo gallery",
      "Monitor and draft AI-powered replies to reviews",
      "Keep business info, categories, and hours up to date",
    ],
    oauthRoute: "/api/auth/google",
    oauthReady: true,
    helpLinks: [
      { label: "Verify your business on Google", href: "https://support.google.com/business/answer/7107242" },
      { label: "Manage your Business Profile", href: "https://business.google.com" },
    ],
  },
  {
    key: "youtube",
    label: "YouTube",
    slug: "youtube",
    color: "#FF0000",
    why: "YouTube is the second largest search engine. Short-form video (Shorts) is exploding for local businesses — project timelapses, how-to clips, and before-and-after reveals get discovered by people actively searching for your services.",
    accountType: "YouTube channel linked to a Google account",
    prerequisites: [
      "A Google account with a YouTube channel",
      "Channel must be in good standing (no strikes)",
      "Shorts upload capability enabled",
    ],
    whatWeDoWithIt: [
      "Upload Shorts and long-form video content",
      "Optimize titles, descriptions, and tags for search",
      "Cross-promote video content across other platforms",
      "Track views, watch time, and subscriber growth",
    ],
    oauthRoute: "/api/auth/youtube",
    oauthReady: true,
    helpLinks: [
      { label: "Create a YouTube channel", href: "https://support.google.com/youtube/answer/1646861" },
      { label: "YouTube Shorts guide", href: "https://support.google.com/youtube/answer/10059070" },
    ],
  },
  {
    key: "tiktok",
    label: "TikTok",
    slug: "tiktok",
    color: "#000000",
    why: "TikTok's algorithm doesn't care how many followers you have — it shows your content to people who are interested in your niche. A single well-timed video can reach tens of thousands. For service businesses, it's the fastest path to visibility you're not using yet.",
    accountType: "TikTok Business account",
    prerequisites: [
      "A TikTok account (Business account recommended for analytics)",
      "Account must be at least 3 days old",
      "Content must comply with TikTok community guidelines",
    ],
    whatWeDoWithIt: [
      "Post short-form videos optimized for the For You page",
      "Apply trending sounds and formats when appropriate",
      "Schedule posts during peak engagement windows",
      "Track video performance and audience demographics",
    ],
    oauthRoute: "/api/auth/tiktok",
    oauthReady: false,
    helpLinks: [
      { label: "Switch to Business Account", href: "https://www.tiktok.com/business/en-US" },
      { label: "TikTok Creator Portal", href: "https://www.tiktok.com/creators/creator-portal/en-us/" },
    ],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    slug: "linkedin",
    color: "#0A66C2",
    why: "LinkedIn is where commercial clients and referral partners look you up. A steady stream of project content and industry insight positions you as a professional operation, not just another contractor. It's underused in your space — which means less competition for attention.",
    accountType: "LinkedIn Company Page or personal profile",
    prerequisites: [
      "A LinkedIn Company Page (recommended) or personal profile",
      "Admin access to the Company Page if using one",
      "Company Page must have a logo and description",
    ],
    whatWeDoWithIt: [
      "Share project updates and professional content",
      "Post articles and thought leadership pieces",
      "Optimize for LinkedIn's professional audience",
      "Build presence for B2B referrals and partnerships",
    ],
    oauthRoute: "/api/auth/linkedin",
    oauthReady: true,
    helpLinks: [
      { label: "Create a Company Page", href: "https://www.linkedin.com/company/setup/new/" },
      { label: "Company Page admin guide", href: "https://www.linkedin.com/help/linkedin/answer/a543852" },
    ],
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    slug: "x-twitter",
    color: "#000000",
    why: "X is real-time visibility. While it's less visual than Instagram, it's where industry conversations happen, news breaks, and local communities engage. Short, frequent updates keep your brand in the conversation without heavy production effort.",
    accountType: "X (Twitter) account",
    prerequisites: [
      "An X account in good standing",
      "Account must not be suspended or restricted",
      "Email or phone verification completed",
    ],
    whatWeDoWithIt: [
      "Post text updates, photos, and thread content",
      "Engage with local and industry conversations",
      "Schedule posts for optimal engagement times",
      "Cross-promote blog articles and project highlights",
    ],
    oauthRoute: "/api/auth/twitter",
    oauthReady: true,
    helpLinks: [
      { label: "Create an X account", href: "https://help.twitter.com/en/using-x/create-x-account" },
    ],
  },
  {
    key: "pinterest",
    label: "Pinterest",
    slug: "pinterest",
    color: "#E60023",
    why: "Pinterest is a visual search engine with the longest content lifespan of any platform. A pin posted today can drive traffic for years. For visual businesses — kitchens, renovations, landscaping, design — Pinterest users are actively planning projects and looking for inspiration.",
    accountType: "Pinterest Business account",
    prerequisites: [
      "A Pinterest Business account (personal accounts can be converted)",
      "At least one board related to your business",
      "Website claimed on Pinterest (we can help with this)",
    ],
    whatWeDoWithIt: [
      "Pin project photos and blog content to relevant boards",
      "Optimize pin descriptions for search discovery",
      "Create idea pins from your best visual content",
      "Drive long-tail traffic to your website",
    ],
    oauthRoute: "/api/auth/pinterest",
    oauthReady: false,
    helpLinks: [
      { label: "Convert to Business Account", href: "https://help.pinterest.com/en/business/article/get-a-business-account" },
      { label: "Claim your website", href: "https://help.pinterest.com/en/business/article/claim-your-website" },
    ],
  },

  // ── Ads / paid integrations (enterprise tier only) ──────────────
  {
    // key matches platform_assets.platform written by /api/auth/meta-ads
    // callback (snake_case). Slug stays kebab for URL convention.
    key: "meta_ads",
    label: "Meta Ads",
    slug: "meta-ads",
    color: "#1877F2",
    why: "Boost organic posts beyond your followers. Meta Ads (Facebook + Instagram) targets the audience that's most likely to convert, with TracPost handling targeting, budget, and creative attachment so you don't need Ads Manager fluency.",
    accountType: "Meta Ad Account in your Business Manager",
    prerequisites: [
      "An Ad Account in your Meta Business Manager (you may already have one)",
      "Admin role on the Ad Account (or finance role for budget management)",
      "Ad Account funded with a payment method (Meta requires this; TracPost never charges your card directly)",
      "Decide which Ad Account funds this business — you'll select it during the connection step",
    ],
    whatWeDoWithIt: [
      "Boost your best-performing organic posts with one click (Quick Boost)",
      "Track campaign performance — impressions, clicks, spend, ROI",
      "Coordinate ad spend with the content engine (post performance feeds boost decisions)",
      "Run hyperlocal targeting via service-area maps with per-campaign overrides",
    ],
    oauthRoute: "/api/auth/meta-ads",
    oauthReady: true,
    helpLinks: [
      { label: "Create a Meta Business Manager", href: "https://business.facebook.com/" },
      { label: "Add an Ad Account", href: "https://www.facebook.com/business/help/910137316041095" },
    ],
    category: "ads",
    tierRequired: "enterprise",
  },
  {
    key: "tiktok-ads",
    label: "TikTok Ads",
    slug: "tiktok-ads",
    color: "#000000",
    why: "TikTok's targeting reaches users actively planning purchases — especially for visual service businesses. Smaller budgets go further than on Meta because TikTok's auction is less saturated.",
    accountType: "TikTok For Business Ad Account",
    prerequisites: [
      "A TikTok For Business account",
      "An Ad Account funded with a payment method",
      "Admin role on the Ad Account",
    ],
    whatWeDoWithIt: [
      "Boost organic TikTok videos via Spark Ads",
      "Run direct video ads from your media library",
      "Track engagement and spend across campaigns",
    ],
    oauthRoute: "/api/auth/tiktok-ads",
    oauthReady: false,
    helpLinks: [
      { label: "TikTok For Business", href: "https://www.tiktok.com/business/" },
    ],
    category: "ads",
    tierRequired: "enterprise",
  },
  {
    key: "pinterest-ads",
    label: "Pinterest Ads",
    slug: "pinterest-ads",
    color: "#E60023",
    why: "Pinterest users are actively planning projects — high commercial intent. Search-driven discovery means well-targeted pins reach buyers in the consideration phase.",
    accountType: "Pinterest Ad Account (Business)",
    prerequisites: [
      "A Pinterest Business account",
      "An Ad Account funded with a payment method",
    ],
    whatWeDoWithIt: [
      "Promote organic pins to expand reach",
      "Run direct ad campaigns targeting purchase intent",
      "Track spend and engagement",
    ],
    oauthRoute: "/api/auth/pinterest-ads",
    oauthReady: false,
    helpLinks: [
      { label: "Pinterest Business", href: "https://business.pinterest.com/" },
    ],
    category: "ads",
    tierRequired: "enterprise",
  },
  {
    key: "linkedin-ads",
    label: "LinkedIn Ads",
    slug: "linkedin-ads",
    color: "#0A66C2",
    why: "LinkedIn ads reach the commercial decision-maker — for B2B referrals, partnerships, and credibility-building at the right buyer level. Premium audience, premium price.",
    accountType: "LinkedIn Marketing Solutions Ad Account",
    prerequisites: [
      "A LinkedIn Company Page",
      "Access to LinkedIn Campaign Manager",
      "An Ad Account funded with a payment method",
    ],
    whatWeDoWithIt: [
      "Promote LinkedIn posts to a B2B audience",
      "Run sponsored content campaigns",
      "Track engagement and conversions",
    ],
    oauthRoute: "/api/auth/linkedin-ads",
    oauthReady: false,
    helpLinks: [
      { label: "LinkedIn Marketing Solutions", href: "https://business.linkedin.com/marketing-solutions" },
    ],
    category: "ads",
    tierRequired: "enterprise",
  },
];

export function getPlatformBySlug(slug: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.slug === slug);
}

export function getPlatformByKey(key: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.key === key);
}
