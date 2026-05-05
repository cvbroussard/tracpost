/**
 * Meta App Review — permission scope data.
 *
 * Single source of truth for the reviewer guide page. Edit here when:
 *   - A scope is added/removed from one of the three Meta apps
 *   - A test step changes (button moved, label changed, route renamed)
 *   - A gap is closed (move from `gaps` to verified test steps)
 *   - A new screenshot path becomes available
 *
 * Per the end-of-session reviewer audit discipline, every session that
 * touches reviewer-walked UE must end with a re-walk against this file.
 *
 * Status field meanings:
 *   - "ready"  — instructions verified against current UE; no known gaps
 *   - "partial" — instructions written but unverified or some gaps remain
 *   - "gap"    — instructions cannot be written until upstream gap is closed
 */

export type ReviewerApp = "pages" | "visual" | "ads";

export type PermissionStatus = "ready" | "partial" | "gap";

export interface ReviewerPermission {
  scope: string;
  app: ReviewerApp;
  description: string;
  whyWeNeed: string;
  testSteps: string[];
  expectedOutcome: string;
  demoLink?: string;
  status: PermissionStatus;
  gaps?: string[];
}

export const APP_LABELS: Record<ReviewerApp, string> = {
  pages: "TracPost — Pages (Facebook)",
  visual: "TracPost — Visual (Instagram)",
  ads: "TracPost — Ads (Marketing API)",
};

export const PERMISSIONS: ReviewerPermission[] = [
  // ---- TracPost — Pages (Facebook) ----
  {
    scope: "pages_show_list",
    app: "pages",
    description: "Lists Facebook Pages the user manages so the subscriber can pick which one to connect.",
    whyWeNeed:
      "Subscribers manage one or more Facebook Pages for their business. After OAuth, TracPost needs to enumerate those Pages so the subscriber can choose which one becomes their connected publishing target.",
    testSteps: [
      "Log in at https://app.tracpost.com/login with the test credentials at the top of this page.",
      "Click 'Connections' (or 'Social') in the sidebar.",
      "Click 'Connect Facebook'.",
      "Complete the Facebook OAuth flow, granting all requested permissions.",
      "Observe the list of Pages the test user manages, rendered in the TracPost UI for selection.",
    ],
    expectedOutcome:
      "After OAuth completes, TracPost displays a card for each Facebook Page available, with the Page name, ID, and a 'Connect' button.",
    demoLink: "https://app.tracpost.com/dashboard/social",
    status: "partial",
    gaps: [
      "Verify exact sidebar label (Connections vs. Social vs. Accounts) — current code shows /dashboard/social",
      "Verify Page-list rendering uses pages_show_list response data and not a cached/mock list",
    ],
  },
  {
    scope: "pages_read_engagement",
    app: "pages",
    description: "Reads engagement metrics (likes, comments, shares, reach) on the connected Page's published content.",
    whyWeNeed:
      "Engagement metrics power the subscriber-facing analytics dashboard and feed the optimization loop that decides what to publish next. Without it, subscribers cannot see how their published content is performing.",
    testSteps: [
      "Complete the pages_show_list test above to connect a Facebook Page.",
      "Navigate to 'Analytics' in the sidebar.",
      "Observe per-post engagement metrics: likes, comments, shares, reach.",
    ],
    expectedOutcome:
      "Analytics page renders a list of recently-published posts with their Facebook engagement metrics fetched live from the Graph API.",
    demoLink: "https://app.tracpost.com/dashboard/analytics",
    status: "partial",
    gaps: [
      "Confirm /dashboard/analytics actually fetches via pages_read_engagement (not a stub or cached value)",
      "Need at least one published post on the test Page to demonstrate metrics rendering",
    ],
  },
  {
    scope: "pages_manage_posts",
    app: "pages",
    description: "Publishes content (text, image, video, carousel) to the connected Facebook Page.",
    whyWeNeed:
      "TracPost's core value proposition is automated social publishing. Captured media plus AI-generated captions are scheduled and published to the subscriber's Facebook Page through this scope.",
    testSteps: [
      "Complete the pages_show_list test above to connect a Facebook Page.",
      "Navigate to 'Compose' or 'Calendar' in the sidebar.",
      "Compose a new post: select a media asset, write or accept a generated caption, click 'Publish now' (or 'Schedule').",
      "Wait for the publish to complete (typically <10 seconds).",
      "Open the connected Facebook Page in a separate tab and verify the post is live.",
    ],
    expectedOutcome:
      "TracPost confirms the publish in the UI (post status: published, with timestamp and Facebook post ID). Visiting the connected Facebook Page shows the new post in the feed.",
    demoLink: "https://app.tracpost.com/dashboard/calendar",
    status: "partial",
    gaps: [
      "Verify the Compose route — is it /dashboard/calendar or a separate /dashboard/compose? (Code shows /dashboard/calendar)",
      "Confirm the test subscriber has at least one media asset available to publish",
      "Confirm the publish flow reports the FB post ID back into the UI for verification",
    ],
  },
  {
    scope: "pages_manage_engagement",
    app: "pages",
    description: "Replies to comments and manages engagement on the connected Page's posts.",
    whyWeNeed:
      "Subscribers respond to customer comments via the TracPost unified inbox. Without this scope, replies have to happen on Facebook directly, breaking the inbox-as-system-of-record value proposition.",
    testSteps: [
      "Complete the pages_manage_posts test above so there's a published post on the connected Page.",
      "Use a separate Facebook account to leave a comment on the post.",
      "In TracPost, navigate to 'Inbox' in the sidebar.",
      "Wait up to 15 minutes for the comment to appear (cron sync interval) OR trigger a manual sync.",
      "Click into the comment, type a reply, click 'Send'.",
      "Verify the reply appears on the Facebook post.",
    ],
    expectedOutcome:
      "The reply posted from TracPost's inbox appears as a comment on the Facebook post within ~5 seconds.",
    demoLink: "https://app.tracpost.com/dashboard/inbox",
    status: "gap",
    gaps: [
      "Confirm inbox reply UI exists and is functional end-to-end",
      "Confirm sync interval and whether manual sync trigger is exposed to subscriber",
      "Verify the writes go through pages_manage_engagement and not a different scope",
    ],
  },
  {
    scope: "pages_read_user_content",
    app: "pages",
    description: "Reads user-generated content (comments, mentions, reactions) on the connected Page.",
    whyWeNeed:
      "The unified inbox surfaces customer comments and mentions for the subscriber to respond to. This scope is what allows TracPost to read those interactions in the first place.",
    testSteps: [
      "Complete the pages_manage_posts test above so there's a published post.",
      "Use a separate Facebook account to leave a comment on the post.",
      "In TracPost, navigate to 'Inbox'.",
      "Wait up to 15 minutes (or manually trigger sync).",
      "Observe the comment appearing in the inbox with attribution (commenter name, timestamp, post link).",
    ],
    expectedOutcome:
      "TracPost displays the inbound comment in the inbox with metadata (commenter, time, source post).",
    demoLink: "https://app.tracpost.com/dashboard/inbox",
    status: "gap",
    gaps: [
      "Confirm inbox displays inbound comments via this scope",
      "Determine whether webhooks or polling is used and document accordingly",
    ],
  },
  {
    scope: "read_insights",
    app: "pages",
    description: "Reads Page-level and post-level insights (reach, impressions, video views, audience demographics).",
    whyWeNeed:
      "Beyond per-post engagement, subscribers want Page-level trends (follower growth, weekly reach, audience composition). This scope provides the deeper analytics that inform publishing strategy.",
    testSteps: [
      "Complete the connection flow above.",
      "Navigate to 'Analytics' in the sidebar.",
      "Switch to 'Page insights' or 'Reach' tab (verify exact label).",
      "Observe Page-level metrics: total reach, follower count, audience demographics.",
    ],
    expectedOutcome:
      "Analytics page renders Page-level insights fetched via this scope, distinct from per-post engagement.",
    demoLink: "https://app.tracpost.com/dashboard/analytics",
    status: "gap",
    gaps: [
      "Confirm Analytics page has a Page-level/insights view distinct from per-post engagement",
      "Verify the data is sourced via read_insights and not just pages_read_engagement",
      "May need new analytics view if not present",
    ],
  },
  {
    scope: "business_management",
    app: "pages",
    description: "Required for managing Pages owned by a Business Manager and accepting agency permission grants.",
    whyWeNeed:
      "TracPost operates on a managed-service model. Subscribers' Pages live inside their Business Manager. This scope is required for TracPost to act on Pages owned by a BM and to maintain the agency relationship that underpins our publishing pipeline.",
    testSteps: [
      "Demonstrated implicitly during the OAuth flow in the pages_show_list test — a Page owned by a Business Manager appears in the list and is selectable.",
      "Optional: show the BM relationship in Meta Business Suite (separate tab) — TracPost listed as a partner with publishing permissions.",
    ],
    expectedOutcome:
      "Pages owned by a Business Manager (not just personally-owned Pages) are discoverable and connectable in TracPost.",
    demoLink: "https://app.tracpost.com/dashboard/social",
    status: "gap",
    gaps: [
      "Confirm test subscriber has at least one BM-owned Page (not just a personal Page)",
      "Decide whether to demonstrate BM agency-grant flow explicitly or implicitly",
      "Recent memory mentions BOBO architecture — confirm whether current implementation still uses BOBO or has shifted",
    ],
  },
  {
    scope: "public_profile",
    app: "pages",
    description: "Reads the connecting user's name and profile picture for display in TracPost.",
    whyWeNeed:
      "Standard scope. Allows TracPost to display the connected user's name and avatar in the account settings UI as confirmation of who is connected.",
    testSteps: [
      "Complete the OAuth flow in the pages_show_list test.",
      "Click the user avatar (top right) or navigate to 'Settings' → 'Connections'.",
      "Observe the connected Facebook user's name and profile photo displayed.",
    ],
    expectedOutcome:
      "Connected Facebook user's name and profile picture are visible in the TracPost UI.",
    demoLink: "https://app.tracpost.com/dashboard/settings",
    status: "partial",
    gaps: [
      "Confirm where the connected user's name/avatar is actually displayed in our current UI",
    ],
  },

  // ---- TracPost — Visual (Instagram) ----
  {
    scope: "instagram_business_basic",
    app: "visual",
    description: "Reads basic Instagram Business account info (username, profile, follower count) of the connected account.",
    whyWeNeed:
      "Required to identify the connected IG Business account and display it in TracPost as a connected publishing target. Foundation for all other IG scopes.",
    testSteps: [
      "Log in at https://app.tracpost.com/login with the test credentials.",
      "Navigate to 'Connections' or 'Social' in the sidebar.",
      "Click 'Connect Instagram'.",
      "Complete the Instagram Business OAuth flow at instagram.com.",
      "Observe the connected Instagram account info (username, profile picture, follower count) rendered in TracPost.",
    ],
    expectedOutcome:
      "After OAuth, TracPost displays the connected IG Business account with its username, avatar, and basic stats.",
    demoLink: "https://app.tracpost.com/dashboard/social",
    status: "partial",
    gaps: [
      "Verify the connected-IG display shows username/avatar/stats clearly",
      "Test subscriber must have an IG Business account (not personal) — confirm test2 setup",
    ],
  },
  {
    scope: "instagram_business_content_publish",
    app: "visual",
    description: "Publishes content (image, video, carousel, Reel) to the connected Instagram Business account.",
    whyWeNeed:
      "Instagram is the highest-priority publishing platform for most TracPost subscribers (visual businesses). This scope enables the autopilot publishing pipeline to ship to IG.",
    testSteps: [
      "Complete the instagram_business_basic test to connect an IG account.",
      "Navigate to 'Compose' or 'Calendar'.",
      "Compose a new post: pick a media asset, write/accept a caption, click 'Publish to Instagram'.",
      "Wait for the publish (typically <30 seconds for IG container creation + publish).",
      "Open the connected IG account on instagram.com or in the mobile app and verify the post is live.",
    ],
    expectedOutcome:
      "TracPost confirms the IG publish in the UI. Visiting the IG account shows the new post.",
    demoLink: "https://app.tracpost.com/dashboard/calendar",
    status: "gap",
    gaps: [
      "Confirm IG publishing flow is functional end-to-end via the IG Login API (not via FB Page proxying)",
      "Confirm test subscriber has at least one media asset suitable for IG (square or 4:5 aspect)",
    ],
  },
  {
    scope: "instagram_business_manage_comments",
    app: "visual",
    description: "Replies to comments on Instagram posts and reads inbound IG comments.",
    whyWeNeed:
      "The unified inbox aggregates IG comments alongside FB comments and other engagement so subscribers respond from one place.",
    testSteps: [
      "Complete the instagram_business_content_publish test so there's a published IG post.",
      "Use a separate IG account to leave a comment on the post.",
      "In TracPost, navigate to 'Inbox'.",
      "Wait up to 15 minutes (or manually trigger sync).",
      "Observe the IG comment appearing in the inbox with attribution.",
      "Type a reply, click 'Send'.",
      "Verify the reply appears on the IG post.",
    ],
    expectedOutcome:
      "Inbound IG comment appears in TracPost inbox; reply sent from inbox appears on the IG post.",
    demoLink: "https://app.tracpost.com/dashboard/inbox",
    status: "gap",
    gaps: [
      "Confirm IG comments are surfaced in the inbox",
      "Confirm reply-to-IG-comment writes via this scope",
    ],
  },
  {
    scope: "instagram_business_manage_insights",
    app: "visual",
    description: "Reads Instagram post-level and account-level insights (reach, impressions, saves, profile visits).",
    whyWeNeed:
      "Subscribers see IG performance metrics in the analytics dashboard. Powers the optimization loop that informs which content types perform on IG vs. FB vs. other platforms.",
    testSteps: [
      "Complete the instagram_business_content_publish test.",
      "Wait at least 24 hours for IG to populate insights data on the published post.",
      "In TracPost, navigate to 'Analytics'.",
      "Filter to Instagram or select the IG-published post.",
      "Observe IG-specific metrics: reach, impressions, saves, profile visits.",
    ],
    expectedOutcome:
      "Analytics page renders IG insights for the published post.",
    demoLink: "https://app.tracpost.com/dashboard/analytics",
    status: "gap",
    gaps: [
      "Confirm Analytics view surfaces IG-specific metrics (not just FB)",
      "Insights data may take 24h+ to populate — plan screencast accordingly",
    ],
  },

  // ---- TracPost — Ads (Marketing API) ----
  {
    scope: "ads_management",
    app: "ads",
    description: "Creates and manages paid ad campaigns (campaigns, ad sets, ads) on the connected Ad Account.",
    whyWeNeed:
      "TracPost's enterprise tier provides paid campaign management. Subscribers boost organic posts that performed well, with TracPost handling targeting, budget, scheduling, and creative attachment.",
    testSteps: [
      "Log in at https://app.tracpost.com/login with the enterprise-tier test credentials.",
      "Navigate to 'Promote' in the sidebar (visible only on enterprise tier).",
      "Connect a Meta Ad Account (one-click OAuth via the TracPost — Ads app).",
      "Select a published post from the list of boost candidates.",
      "Configure: daily budget ($5), duration (3 days), targeting (local), CTA (Learn More).",
      "Click 'Boost'.",
      "Wait for the campaign to be created (~5 seconds).",
      "Open Meta Ads Manager in a separate tab and verify the campaign + ad set + ad exist with the configured settings.",
    ],
    expectedOutcome:
      "TracPost creates a Campaign + Ad Set + Ad via the Marketing API. The campaign is visible in Meta Ads Manager with the configured budget, targeting, and creative.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "Verify Promote module visibility is enterprise-only and the test2 subscriber is on enterprise tier",
      "Verify test subscriber has at least one published boostable post",
      "Confirm the screencast captures the round-trip (TracPost → Meta Ads Manager verification)",
    ],
  },
  {
    scope: "ads_read",
    app: "ads",
    description: "Reads campaign, ad set, and ad performance data (impressions, clicks, spend, conversions).",
    whyWeNeed:
      "Subscribers see how their boosted campaigns are performing within TracPost without having to open Meta Ads Manager. Powers the campaigns drill-down view and the auto-boost engine's winner-detection logic (future).",
    testSteps: [
      "Complete the ads_management test above to create a campaign.",
      "Navigate to 'Promote' → click into the just-created campaign.",
      "Observe the drill-down view showing campaign hierarchy (Campaign → Ad Set → Ad) and per-entity insights (impressions, clicks, spend) once Meta has populated data (~30 min after launch).",
    ],
    expectedOutcome:
      "TracPost displays campaign performance metrics fetched live from the Marketing API.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "Insights data takes ~30 min to populate after launch — plan screencast timing",
      "Confirm drill-down view shows actual ads_read data and not stubs",
    ],
  },
  {
    scope: "business_management",
    app: "ads",
    description: "Required for managing ad accounts owned by a Business Manager and accessing BM-scoped Pages/IG.",
    whyWeNeed:
      "Marketing API operations on subscriber Ad Accounts (which live inside their BM) require business_management. Also enables identifying the Page-IG link required for IG ad placements.",
    testSteps: [
      "Demonstrated implicitly during the ads_management test above — the connected Ad Account is BM-owned and TracPost successfully creates a campaign on it.",
    ],
    expectedOutcome: "BM-owned Ad Accounts are discoverable and TracPost can write to them.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "ready",
  },
  {
    scope: "pages_show_list",
    app: "ads",
    description: "Used by the Ads app to identify which Pages can be boosted from (the page that owns the post being boosted).",
    whyWeNeed:
      "When a subscriber boosts a post, the Marketing API needs to know which Page the post belongs to (via object_story_id). This scope on the Ads app is what gives the Marketing API connection visibility into the user's Pages.",
    testSteps: [
      "Demonstrated implicitly during the ads_management test — the boost flow successfully attaches the published organic post (via its Page-owned object_story_id) to the new ad.",
    ],
    expectedOutcome: "Boost-eligible posts are discoverable and attachable as ad creative.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "ready",
  },
  {
    scope: "pages_read_engagement",
    app: "ads",
    description: "Used by the Ads app to identify which posts are boost candidates based on organic performance.",
    whyWeNeed:
      "Boost candidates are surfaced based on organic engagement (likes, comments, shares, reach). This scope on the Ads app enables TracPost to read that data in the boost-candidate selection UI.",
    testSteps: [
      "Navigate to 'Promote' → 'Boost a post'.",
      "Observe the list of recent published posts annotated with engagement counts (likes, comments, shares).",
      "Select a high-engagement post to boost.",
    ],
    expectedOutcome: "Boost-candidate list shows organic engagement metrics for each post.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "Confirm boost-candidate list actually displays engagement counts",
    ],
  },
  {
    scope: "public_profile",
    app: "ads",
    description: "Reads the connecting user's name and profile picture for display.",
    whyWeNeed:
      "Standard scope. Same purpose as the Pages-app version of this scope — display connected user identity in the Ads-connection UI.",
    testSteps: [
      "Complete the Ad Account connection flow.",
      "Observe the connected user's name displayed in the Ads connection settings.",
    ],
    expectedOutcome: "Connected user's name visible in Ads connection UI.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "Confirm where the connected Ads-app user identity is displayed",
    ],
  },
];

/**
 * Permissions grouped by app for the index table.
 */
export function permissionsByApp(): Record<ReviewerApp, ReviewerPermission[]> {
  const grouped: Record<ReviewerApp, ReviewerPermission[]> = {
    pages: [],
    visual: [],
    ads: [],
  };
  for (const p of PERMISSIONS) {
    grouped[p.app].push(p);
  }
  return grouped;
}

/**
 * Anchor ID for a permission section. Two permissions can share a scope
 * name across apps (e.g., business_management appears in pages and ads),
 * so we namespace by app.
 */
export function anchorId(p: ReviewerPermission): string {
  return `${p.app}-${p.scope}`;
}

/**
 * Aggregate gap count for the gap summary.
 */
export function gapCount(): number {
  return PERMISSIONS.reduce((sum, p) => sum + (p.gaps?.length ?? 0), 0);
}

/**
 * All distinct gap descriptions for the gap summary section.
 */
export function allGaps(): { permission: ReviewerPermission; gap: string }[] {
  const out: { permission: ReviewerPermission; gap: string }[] = [];
  for (const p of PERMISSIONS) {
    if (!p.gaps) continue;
    for (const gap of p.gaps) {
      out.push({ permission: p, gap });
    }
  }
  return out;
}

/**
 * Page version + last-updated. Bump on every edit.
 */
export const PAGE_VERSION = "0.1";
export const LAST_UPDATED = "2026-05-05";

/**
 * Test credentials (rotate before submission).
 */
export const TEST_CREDENTIALS = {
  url: "https://app.tracpost.com/login",
  email: "test2@tracpost.com",
  password: "ReviewMe-2026!",
  notes:
    "Test subscriber 'test2' has the enterprise tier active with one site provisioned. " +
    "All three Meta apps (Pages, Visual, Ads) can be connected end-to-end with this account. " +
    "Credentials will be rotated after the review window closes.",
};
