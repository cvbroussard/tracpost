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
}

export const PLATFORMS: PlatformConfig[] = [
  {
    key: "instagram",
    label: "Instagram",
    slug: "instagram",
    color: "#E1306C",
    why: "Instagram is where your work gets discovered visually. Connected via Meta — one authorization covers both Instagram and Facebook.",
    accountType: "Instagram Business or Creator account linked to a Facebook Page",
    prerequisites: [
      "An Instagram account (personal accounts will need to be converted to Business)",
      "A Facebook Page linked to the Instagram account",
      "Admin access to the Facebook Page",
    ],
    whatWeDoWithIt: [
      "Post photos, carousels, and Reels on your behalf",
      "Apply platform-specific formatting and hashtag strategy",
      "Track engagement and adjust content mix automatically",
    ],
    oauthRoute: "/api/auth/instagram",
    oauthReady: true,
    hubTargetSlug: "meta",
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
    why: "Facebook Pages are the most trusted local presence — the first thing customers find when they search your business name. Connected via Meta — one authorization covers both Facebook and Instagram.",
    accountType: "Facebook Page (not a personal profile)",
    prerequisites: [
      "A Facebook Page for your business (not your personal profile)",
      "Admin role on the Page",
      "Page must be published (not in draft state)",
    ],
    whatWeDoWithIt: [
      "Publish posts, photos, and link shares to your Page",
      "Cross-post content optimized for Facebook's algorithm",
      "Coordinate posting with Instagram for maximum reach",
    ],
    oauthRoute: "/api/auth/instagram",
    oauthReady: true,
    hubTargetSlug: "meta",
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
];

export function getPlatformBySlug(slug: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.slug === slug);
}

export function getPlatformByKey(key: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.key === key);
}
