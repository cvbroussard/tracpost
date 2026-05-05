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
 * ── STATUS FIELD MEANINGS ──────────────────────────────────────────────
 *   - "ready"   — instructions verified against current UE; no known gaps
 *   - "partial" — instructions written but unverified or some gaps remain
 *   - "gap"     — instructions cannot be written until upstream gap is closed
 *
 * ── GAP PREFIX CONVENTIONS ─────────────────────────────────────────────
 *   - BUILD:      real development work — code/UI that must be created
 *   - VERIFY:     flow likely exists; confirm end-to-end against current UE
 *   - TEST DATA:  setup required on the test subscriber (test2) before review
 *   - DECISION:   open question to resolve before this scope can submit
 *
 * All gaps are framed under the manual-first methodology — each scope
 * needs a subscriber-initiated Select → Recommend → Review → Trigger
 * flow that demonstrates the scope being exercised. Autopilot does not
 * count as evidence for review purposes; a user-clicked action does.
 *
 * ── WORKFLOW STAGES ────────────────────────────────────────────────────
 *
 * Each scope is assigned a `workflowStage` that mirrors how the reviewer
 * naturally walks the app:
 *
 *   - "connect"  — OAuth + identity foundation (must happen first)
 *   - "publish"  — create content on Meta (the action)
 *   - "observe"  — read metrics on what was published (analytics)
 *   - "engage"   — read inbound content + reply (inbox flow)
 *
 * Permissions are ordered within each app by stage, then by intra-stage
 * dependency (foundational first). The reviewer reads top-to-bottom in
 * the order they'd actually demo the app.
 *
 * ── ENTITY NAMING STANDARD ─────────────────────────────────────────────
 *
 * Use these terms consistently. Defaults keep prose readable; qualified
 * terms only when precision matters for the reviewer's understanding.
 *
 * Defaults (use these unless you need a qualified term):
 *   - "TracPost"          — the brand (no app/platform distinction needed)
 *   - "the subscriber"    — the human navigating the UI (DEFAULT meaning)
 *   - "the reviewer"      — the Meta App Reviewer
 *
 * Qualified terms (use when distinction matters):
 *   - "TracPost app"             — frontend UI surface (what subscriber sees/clicks)
 *   - "TracPost platform"        — backend infrastructure / Eppux LLC
 *   - "subscriber account"       — legal/billing entity (rarely needed)
 *   - "subscriber business"      — the business being marketed (Page/IG owner)
 *   - "connected Facebook account" — the FB user identity that granted OAuth
 *   - "connected Page"           — the FB Page being managed
 *   - "connected Business Manager" / "connected BM" — the Meta BM housing assets
 *   - "connected Instagram account" — the IG Business account
 *   - "connected Ad Account"     — the Meta Ad Account
 *
 * For OAuth language specifically, use the strict version. Reviewers care
 * about who-grants-what. Prefer:
 *   "The subscriber initiates OAuth on their connected Facebook account,
 *    granting the TracPost platform permission to manage the connected Page."
 * Over:
 *   "The subscriber connects their Page."
 *
 * For test steps, address the reviewer in the imperative ("Log in...",
 * "Click..."). The reviewer is acting AS the subscriber when navigating
 * the TracPost app and AS a separate Facebook user when completing
 * Facebook OAuth.
 */

export type ReviewerApp = "pages" | "visual" | "ads";

export type PermissionStatus = "ready" | "partial" | "gap";

export type WorkflowStage = "connect" | "publish" | "observe" | "engage";

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  connect: "Connect",
  publish: "Publish",
  observe: "Observe",
  engage: "Engage",
};

export const STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  connect: "OAuth + identity foundation. The subscriber binds connected assets (Page, IG, Ad Account) before any other action is possible.",
  publish: "Creating content on Meta — the action step. Subscriber selects, reviews, and triggers a publish or campaign creation.",
  observe: "Reading metrics on what was published. The analytics surface that closes the feedback loop.",
  engage: "Reading inbound content (comments, mentions) and replying via the unified inbox.",
};

export interface ReviewerPermission {
  scope: string;
  app: ReviewerApp;
  workflowStage: WorkflowStage;
  description: string;
  whyWeNeed: string;
  testSteps: string[];
  expectedOutcome: string;
  demoLink?: string;
  status: PermissionStatus;
  gaps?: string[];
  /**
   * ISO date (YYYY-MM-DD) when this scope was last signed off as accurate
   * against the live UE. Set when status flips to "ready". Per-scope
   * provenance distinct from page-level LAST_UPDATED — answers
   * "when was THIS scope verified accurate" rather than "when did any
   * change ship". If verifiedAt predates a UE change to this scope's
   * surface, re-verify rather than assume.
   */
  verifiedAt?: string;
}

export const APP_LABELS: Record<ReviewerApp, string> = {
  pages: "TracPost — Pages (Facebook)",
  visual: "TracPost — Visual (Instagram)",
  ads: "TracPost — Ads (Marketing API)",
};

/**
 * Per-app Meta Developer metadata for the reviewer-facing title block.
 *
 * The App ID is sourced from environment variables at server-render time
 * (single source of truth — same env vars the OAuth flows use). If the
 * env var is missing, the title block renders "(not configured)" which
 * is a useful signal that this app's OAuth wouldn't work either.
 *
 * Update `appMode` when an app transitions from Development to Live.
 */
export const APP_METADATA: Record<
  ReviewerApp,
  {
    name: string;
    appIdEnvVar: string;
    ownerEntity: string;
    ownerContact: string;
    privacyPolicyUrl: string;
    termsOfServiceUrl: string;
    dataDeletionUrl: string;
    appMode: "Live" | "Development";
  }
> = {
  pages: {
    name: "TracPost — Pages",
    appIdEnvVar: "META_PAGES_APP_ID",
    ownerEntity: "Eppux, LLC",
    ownerContact: "carl@tracpost.com",
    privacyPolicyUrl: "https://tracpost.com/privacy",
    termsOfServiceUrl: "https://tracpost.com/terms",
    dataDeletionUrl: "https://tracpost.com/data-deletion",
    appMode: "Development",
  },
  visual: {
    name: "TracPost — Visual",
    appIdEnvVar: "META_VISUAL_APP_ID",
    ownerEntity: "Eppux, LLC",
    ownerContact: "carl@tracpost.com",
    privacyPolicyUrl: "https://tracpost.com/privacy",
    termsOfServiceUrl: "https://tracpost.com/terms",
    dataDeletionUrl: "https://tracpost.com/data-deletion",
    appMode: "Development",
  },
  ads: {
    name: "TracPost — Ads",
    appIdEnvVar: "META_ADS_APP_ID",
    ownerEntity: "Eppux, LLC",
    ownerContact: "carl@tracpost.com",
    privacyPolicyUrl: "https://tracpost.com/privacy",
    termsOfServiceUrl: "https://tracpost.com/terms",
    dataDeletionUrl: "https://tracpost.com/data-deletion",
    appMode: "Development",
  },
};

export const PERMISSIONS: ReviewerPermission[] = [
  // ════════════════════════════════════════════════════════════════════
  // TracPost — Pages (Facebook)
  // ════════════════════════════════════════════════════════════════════

  // ── Connect ─────────────────────────────────────────────────────────
  {
    scope: "public_profile",
    app: "pages",
    workflowStage: "connect",
    description: "Reads the connected Facebook account's name for display in the TracPost app.",
    whyWeNeed:
      "Standard scope. Allows the TracPost app to display the connected Facebook account's name in the connection card as confirmation of who is connected — the human OAuth-granting identity, distinct from the connected Page.",
    testSteps: [
      "Complete the OAuth flow in the pages_show_list test.",
      "On the Facebook connection detail page (/accounts/facebook), observe the 'Connected as {name}' row in the Connection card.",
    ],
    expectedOutcome:
      "The connected Facebook account's name appears in the 'Connected as' row of the Connection card, distinct from the 'Connected Page' row.",
    demoLink: "https://app.tracpost.com/dashboard/accounts/facebook",
    status: "ready",
    verifiedAt: "2026-05-05",
  },
  {
    scope: "pages_show_list",
    app: "pages",
    workflowStage: "connect",
    description: "Lists Facebook Pages the connected Facebook account administers so the subscriber can select which one becomes the connected Page.",
    whyWeNeed:
      "Subscriber businesses operate one or more Facebook Pages. After the subscriber initiates OAuth on their connected Facebook account, the TracPost platform enumerates the Pages that account administers so the subscriber can select which one becomes the connected Page for publishing.",
    testSteps: [
      "Log in at https://app.tracpost.com/login with the credentials at the top of this page (acting as the subscriber).",
      "Click 'Connections' (or 'Social') in the sidebar.",
      "Click 'Connect Facebook' to initiate OAuth on a Facebook account.",
      "Complete the OAuth flow on the connected Facebook account, granting all requested permissions to the TracPost platform.",
      "Observe the list of Pages the connected Facebook account administers, rendered in the TracPost app for selection.",
    ],
    expectedOutcome:
      "After OAuth completes, the TracPost app lands on /accounts/facebook with a prominent picker showing each Facebook Page the connected Facebook account administers. (Single-Page case auto-binds to the site without showing the picker.)",
    demoLink: "https://app.tracpost.com/dashboard/accounts/facebook",
    status: "ready",
    verifiedAt: "2026-05-05",
  },
  {
    scope: "business_management",
    app: "pages",
    workflowStage: "connect",
    description: "Required for managing connected Pages owned by a connected Business Manager and accepting agency permission grants.",
    whyWeNeed:
      "TracPost operates on a managed-service model. Subscriber businesses' connected Pages typically live inside a connected Business Manager. This scope is required for the TracPost platform to act on Pages owned by a BM and to maintain the agency relationship that underpins our publishing pipeline.",
    testSteps: [
      "Demonstrated implicitly during the OAuth flow in the pages_show_list test — a connected Page owned by a connected BM appears in the list and is selectable.",
      "Optional: show the BM relationship in Meta Business Suite (separate tab) — the TracPost platform listed as a partner with publishing permissions on the subscriber business's connected BM.",
    ],
    expectedOutcome:
      "Connected Pages owned by a connected Business Manager are discoverable in the post-OAuth picker and bindable to the TracPost site. Verified end-to-end with a BM-owned test Page.",
    demoLink: "https://app.tracpost.com/dashboard/accounts/facebook",
    status: "ready",
    verifiedAt: "2026-05-05",
  },

  // ── Publish ─────────────────────────────────────────────────────────
  {
    scope: "pages_manage_posts",
    app: "pages",
    workflowStage: "publish",
    description: "Publishes content (text, image, video, carousel) to the connected Page.",
    whyWeNeed:
      "TracPost's core value proposition is automated social publishing. The subscriber-facing manual flow follows Select → Recommend → Review → Trigger: the subscriber picks a template or asset, sees the TracPost platform's recommended caption + assembly, reviews the preview, and clicks Publish. The TracPost platform then publishes to the connected Page via the Pages API.",
    testSteps: [
      "Complete the pages_show_list test above to bind a connected Page.",
      "Navigate to 'Compose' or 'Calendar' in the sidebar.",
      "Select a template or media asset from the picker.",
      "Review the prepared post (caption, assets, target connected Page).",
      "Click 'Publish now'.",
      "Wait for the publish to complete (typically <10 seconds) and observe the success state with the Facebook post ID.",
      "Open the connected Page in a separate tab and verify the post is live.",
    ],
    expectedOutcome:
      "The TracPost app confirms the publish with the Facebook post ID. Visiting the connected Page shows the new post in the feed.",
    demoLink: "https://app.tracpost.com/dashboard/calendar",
    status: "partial",
    gaps: [
      "BUILD (interim, for v1 review): if calendar/compose flow doesn't already follow Select → Recommend → Review → Trigger cleanly, ship a minimal manual publish surface that does. Full template-first refactor is task #82 (post-review).",
      "VERIFY: existing /dashboard/calendar manual publish path works end-to-end and the success state shows the Facebook post ID for reviewer verification",
      "VERIFY: the subscriber's click is the trigger (not a cron-fired autopilot publish — that doesn't satisfy review)",
      "TEST DATA: the subscriber's media library on test2 needs at least one asset suitable for FB",
      "MANUAL-FIRST RULE: this scope's autopilot path can wait — review needs the manual click-to-publish flow visible and clean",
    ],
  },

  // ── Observe ─────────────────────────────────────────────────────────
  {
    scope: "pages_read_engagement",
    app: "pages",
    workflowStage: "observe",
    description: "Reads engagement metrics (likes, comments, shares, reach) on content published to the connected Page.",
    whyWeNeed:
      "Engagement metrics on the connected Page power the subscriber-facing analytics in the TracPost app and feed the TracPost platform's optimization loop. Without this scope, the subscriber cannot see how content published to the connected Page is performing.",
    testSteps: [
      "Complete the pages_show_list test above to bind a connected Page.",
      "Navigate to 'Analytics' in the sidebar.",
      "Select a recent published post (or click 'Refresh metrics').",
      "Observe per-post engagement metrics: likes, comments, shares, reach.",
    ],
    expectedOutcome:
      "The TracPost app renders engagement metrics for the selected post, fetched live from the Graph API as a result of the subscriber's click.",
    demoLink: "https://app.tracpost.com/dashboard/analytics",
    status: "partial",
    gaps: [
      "VERIFY: /dashboard/analytics renders per-post engagement metrics fetched live from the Pages API (not stubs/cache)",
      "VERIFY: a subscriber-initiated action (post selection or refresh button) visibly triggers the API call",
      "BUILD (if missing): per-post drill-down view with a 'view metrics' action — the engagement-fetch must be observable as a clicked action, not just a passive table render",
      "TEST DATA: at least one published post on the connected Page with real engagement (manually like/comment from a separate Facebook account if needed)",
    ],
  },
  {
    scope: "read_insights",
    app: "pages",
    workflowStage: "observe",
    description: "Reads Page-level and post-level insights (reach, impressions, video views, audience demographics) for the connected Page.",
    whyWeNeed:
      "Beyond per-post engagement, the subscriber wants Page-level trends for the connected Page (follower growth, weekly reach, audience composition). The flow is Select → Recommend → Review: the subscriber picks a time range, sees the metrics fetched + visualized, inspects the result.",
    testSteps: [
      "Complete the connection flow above to bind a connected Page.",
      "Navigate to 'Analytics' in the sidebar.",
      "Switch to the 'Page Insights' tab.",
      "Select a time range (e.g., 'Last 28 days').",
      "Observe Page-level metrics for the connected Page: total reach, follower count, audience demographics.",
    ],
    expectedOutcome:
      "The TracPost app renders Page-level insights for the connected Page, fetched via this scope and distinct from per-post engagement.",
    demoLink: "https://app.tracpost.com/dashboard/analytics",
    status: "gap",
    gaps: [
      "BUILD (likely a real dev gap): /dashboard/analytics may not currently surface Page-level insights distinct from per-post engagement. Need to add a Page Insights view (or tab) — reach trend, follower growth, audience demographics. Without this, the scope has no subscriber-visible exercise path.",
      "VERIFY: data is sourced via read_insights API endpoints (not pages_read_engagement, which is a different scope)",
      "BUILD: time-range selector or refresh button as the subscriber-initiated trigger for the API call (per the unified UX pattern)",
      "TEST DATA: the connected Page needs at least 30 days of activity for meaningful insights data",
    ],
  },

  // ── Engage ──────────────────────────────────────────────────────────
  {
    scope: "pages_read_user_content",
    app: "pages",
    workflowStage: "engage",
    description: "Reads user-generated content (comments, mentions, reactions) on the connected Page.",
    whyWeNeed:
      "The TracPost app inbox surfaces customer comments and mentions on the connected Page so the subscriber can respond. This scope is what allows the TracPost platform to read those interactions in the first place — it's the SELECT step of the inbox module's reply flow.",
    testSteps: [
      "Complete the pages_manage_posts test above so there's a published post on the connected Page.",
      "Use a separate Facebook account to leave a comment on the post.",
      "In the TracPost app, navigate to 'Inbox'.",
      "Click 'Refresh' (or wait for cron sync).",
      "Observe the comment appearing in the inbox list with attribution (commenter name, timestamp, source post on the connected Page).",
    ],
    expectedOutcome:
      "The TracPost app inbox displays the inbound comment with metadata (commenter, time, source post).",
    demoLink: "https://app.tracpost.com/dashboard/inbox",
    status: "gap",
    gaps: [
      "VERIFY: inbox displays inbound user-generated content on the connected Page with attribution and timestamp",
      "VERIFY: sync mechanism (webhook vs polling) populates the inbox reliably; document the user-observable refresh path so the reviewer doesn't think it's broken",
      "BUILD (shared with pages_manage_engagement): subscriber-visible 'Refresh' button so the reviewer can demo within minutes",
      "TEST DATA: shared with pages_manage_engagement — need real inbound comment",
      "DECISION: webhook subscriptions vs polling — if webhooks, document for the reviewer; if polling, ensure interval is short enough to demo",
    ],
  },
  {
    scope: "pages_manage_engagement",
    app: "pages",
    workflowStage: "engage",
    description: "Replies to comments and manages engagement on posts published to the connected Page.",
    whyWeNeed:
      "The subscriber responds to inbound comments on the connected Page via TracPost's unified inbox. The flow follows Select → Recommend → Review → Trigger: the subscriber selects a comment, sees a suggested reply (Brand DNA voiced), reviews, clicks Send. Without this scope, replies have to happen on Facebook directly, breaking the inbox-as-system-of-record value proposition.",
    testSteps: [
      "Complete the pages_manage_posts test above so there's a published post on the connected Page.",
      "Use a separate Facebook account to leave a comment on the post.",
      "In the TracPost app, navigate to 'Inbox' in the sidebar.",
      "Click 'Refresh' to fetch latest (or wait for the cron sync).",
      "Select the comment from the inbox list.",
      "Review the suggested reply (or type a freeform reply).",
      "Click 'Send'.",
      "Verify the reply appears on the connected Page's post.",
    ],
    expectedOutcome:
      "The reply submitted from the TracPost app inbox appears as a comment on the connected Page's post within ~5 seconds.",
    demoLink: "https://app.tracpost.com/dashboard/inbox",
    status: "gap",
    gaps: [
      "BUILD/VERIFY: inbox at /dashboard/inbox must show inbound comments on the connected Page with a reply input. Reply submission must write via pages_manage_engagement and confirm visibly. End-to-end manual-first flow is the prerequisite for any future autopilot reply work.",
      "BUILD: subscriber-visible 'Refresh' or 'Fetch latest' button — cron-only sync would block reviewer demo timing (the reviewer needs to demo within minutes, not 15-min cycles)",
      "BUILD (Recommend step): Brand DNA-voiced suggested reply per the unified UX pattern. Minimum acceptable for v1: freeform reply input with no suggestion. Full Brand DNA suggestion is post-review polish.",
      "TEST DATA: published post on the connected Page + a real comment from a separate Facebook account (multi-step prep — coordinate before screencast)",
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // TracPost — Visual (Instagram)
  // ════════════════════════════════════════════════════════════════════

  // ── Connect ─────────────────────────────────────────────────────────
  {
    scope: "instagram_business_basic",
    app: "visual",
    workflowStage: "connect",
    description: "Reads basic profile info (username, profile picture, follower count) of the connected Instagram account.",
    whyWeNeed:
      "Required to identify the connected Instagram account and display it in the TracPost app as a connected publishing target. Foundation for all other Instagram scopes — this is the SELECT step that makes the connected Instagram account available to the rest of the system.",
    testSteps: [
      "Log in at https://app.tracpost.com/login with the credentials at the top of this page (acting as the subscriber).",
      "Navigate to 'Connections' or 'Social' in the sidebar.",
      "Click 'Connect Instagram' to initiate OAuth on an Instagram Business account.",
      "Complete the OAuth flow at instagram.com, granting all requested permissions to the TracPost platform.",
      "Observe the connected Instagram account info (username, profile picture, follower count) rendered in the TracPost app.",
    ],
    expectedOutcome:
      "After OAuth, the TracPost app displays the connected Instagram account with its username, avatar, and basic stats.",
    demoLink: "https://app.tracpost.com/dashboard/social",
    status: "partial",
    gaps: [
      "VERIFY: IG OAuth flow at /api/auth/instagram completes and lands the subscriber back on /dashboard/social with the connected Instagram account info displayed (username, avatar, basic stats)",
      "VERIFY: the displayed info comes from the live IG Login API call (not a cached/stub value)",
      "TEST DATA: test2 must have an Instagram Business account linked to a Page (not personal IG). Confirm before submission.",
    ],
  },

  // ── Publish ─────────────────────────────────────────────────────────
  {
    scope: "instagram_business_content_publish",
    app: "visual",
    workflowStage: "publish",
    description: "Publishes content (image, video, carousel, Reel) to the connected Instagram account.",
    whyWeNeed:
      "Instagram is the highest-priority publishing platform for most subscribers (visual businesses). The subscriber-facing flow follows Select → Recommend → Review → Trigger: the subscriber picks an Instagram template (Single Image, Carousel, Reel), sees the TracPost platform's prepared package, reviews the preview, clicks Publish. The TracPost platform then publishes to the connected Instagram account via the IG Login API.",
    testSteps: [
      "Complete the instagram_business_basic test to bind a connected Instagram account.",
      "Navigate to 'Compose' or 'Calendar'.",
      "Select an Instagram template (or asset in the interim flow).",
      "Review the prepared post (caption, asset, target connected Instagram account).",
      "Click 'Publish to Instagram'.",
      "Wait for the publish (typically <30 seconds for IG container creation + publish).",
      "Open the connected Instagram account on instagram.com or in the mobile app and verify the post is live.",
    ],
    expectedOutcome:
      "The TracPost app confirms the publish with the IG media ID. Visiting the connected Instagram account shows the new post.",
    demoLink: "https://app.tracpost.com/dashboard/calendar",
    status: "gap",
    gaps: [
      "BUILD/VERIFY: same as pages_manage_posts — manual IG publish flow must follow Select → Recommend → Review → Trigger. May share the same publish surface as FB or be a separate flow.",
      "VERIFY: publishes via the IG Login API (instagram.com OAuth → IG Graph API) and NOT via the Pages app's IG proxy — different scope/codepath",
      "VERIFY: container creation + media_publish two-step is observable in the TracPost app (progress indicator) so the reviewer doesn't think it stalled",
      "TEST DATA: media asset must be IG-acceptable format (square 1:1, portrait 4:5, or vertical 9:16 for Reels)",
      "MANUAL-FIRST RULE: same as FB publish — manual click-to-publish path is the demonstration; autopilot waits per [feedback_manual_before_autopilot]",
    ],
  },

  // ── Observe ─────────────────────────────────────────────────────────
  {
    scope: "instagram_business_manage_insights",
    app: "visual",
    workflowStage: "observe",
    description: "Reads post-level and account-level insights (reach, impressions, saves, profile visits) for the connected Instagram account.",
    whyWeNeed:
      "The subscriber sees Instagram performance metrics in the TracPost app's analytics dashboard. Powers the optimization loop that informs which content types perform on Instagram vs. Facebook vs. other platforms.",
    testSteps: [
      "Complete the instagram_business_content_publish test.",
      "Wait at least 24 hours for Instagram to populate insights data on the published post.",
      "In the TracPost app, navigate to 'Analytics'.",
      "Filter to Instagram or select the published post on the connected Instagram account.",
      "Observe Instagram-specific metrics: reach, impressions, saves, profile visits.",
    ],
    expectedOutcome:
      "The TracPost app renders Instagram insights for the published post via a subscriber-initiated action.",
    demoLink: "https://app.tracpost.com/dashboard/analytics",
    status: "gap",
    gaps: [
      "BUILD (likely a real dev gap): analytics view needs to surface Instagram-specific metrics (reach, impressions, saves, profile visits) per post and at account level. Without this, the scope has no subscriber-visible exercise path.",
      "BUILD: time-range or post selector as the subscriber-initiated trigger (per unified UX pattern)",
      "TIMING CONSTRAINT: Instagram insights data may take 24h+ to populate after publish; screencast must be timed accordingly. Plan: publish a test post on the connected Instagram account 1-2 days before recording.",
      "TEST DATA: at least one Instagram post on the connected Instagram account that's been live >24h to have populated insights",
    ],
  },

  // ── Engage ──────────────────────────────────────────────────────────
  {
    scope: "instagram_business_manage_comments",
    app: "visual",
    workflowStage: "engage",
    description: "Replies to comments on the connected Instagram account's posts and reads inbound comments.",
    whyWeNeed:
      "The TracPost app's unified inbox aggregates comments on the connected Instagram account alongside Facebook comments and other engagement so the subscriber responds from one place. Same Select → Recommend → Review → Trigger flow as the Pages comment-reply scope, applied to Instagram.",
    testSteps: [
      "Complete the instagram_business_content_publish test so there's a published post on the connected Instagram account.",
      "Use a separate Instagram account to leave a comment on the post.",
      "In the TracPost app, navigate to 'Inbox'.",
      "Click 'Refresh' (or wait for sync).",
      "Select the Instagram comment from the inbox list.",
      "Review the suggested reply (or type a freeform reply).",
      "Click 'Send'.",
      "Verify the reply appears on the connected Instagram account's post.",
    ],
    expectedOutcome:
      "The inbound Instagram comment appears in the TracPost app inbox; the reply sent from the inbox appears on the connected Instagram account's post.",
    demoLink: "https://app.tracpost.com/dashboard/inbox",
    status: "gap",
    gaps: [
      "VERIFY: inbox at /dashboard/inbox surfaces Instagram comments alongside Facebook comments (unified inbox)",
      "VERIFY: reply submission for Instagram comments uses the IG Graph API (not the Pages API — different scope, different codepath)",
      "BUILD: shared with pages_manage_engagement — subscriber-visible 'Refresh' button + reply input. Same UI work, broader scope coverage.",
      "TEST DATA: published post on the connected Instagram account + comment from a separate Instagram account (multi-step prep)",
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // TracPost — Ads (Marketing API)
  // ════════════════════════════════════════════════════════════════════

  // ── Connect ─────────────────────────────────────────────────────────
  {
    scope: "public_profile",
    app: "ads",
    workflowStage: "connect",
    description: "Reads the connected Facebook account's name and profile picture for display in the TracPost app.",
    whyWeNeed:
      "Standard scope. Same purpose as the Pages-app version — display the connected Facebook account's identity in the Ads connection UI so the subscriber can confirm which Meta account is connected for ads.",
    testSteps: [
      "Complete the connected Ad Account connection flow.",
      "Observe the connected Facebook account's name displayed in the Ads connection settings (e.g., 'Connected as Carl Broussard').",
    ],
    expectedOutcome: "The connected Facebook account's name is visible in the Ads connection UI in the TracPost app.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "VERIFY: connected Facebook account's identity visible in the Promote module's connection settings or account-info area (typically near the connected Ad Account picker)",
      "Same pattern as Pages app's public_profile gap — same surface conventions",
    ],
  },
  {
    scope: "business_management",
    app: "ads",
    workflowStage: "connect",
    description: "Required for managing connected Ad Accounts owned by a connected Business Manager and accessing BM-scoped Pages/IG.",
    whyWeNeed:
      "Marketing API operations on connected Ad Accounts (which live inside a connected BM) require business_management. Also enables identifying the Page-IG link required for IG ad placements on the connected Page.",
    testSteps: [
      "Demonstrated implicitly during the ads_management test — the connected Ad Account is BM-owned and the TracPost platform successfully creates a campaign on it.",
    ],
    expectedOutcome: "BM-owned connected Ad Accounts are discoverable and the TracPost platform can write to them.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "ready",
    verifiedAt: "2026-05-05",
  },
  {
    scope: "pages_show_list",
    app: "ads",
    workflowStage: "connect",
    description: "Used by the Ads app to identify which connected Pages can be boosted from (the Page that owns the post being boosted).",
    whyWeNeed:
      "When the subscriber boosts a post, the Marketing API needs to know which connected Page the post belongs to (via object_story_id). This scope on the Ads app is what gives the Marketing API connection visibility into the Pages the connected Facebook account administers.",
    testSteps: [
      "Demonstrated implicitly during the ads_management test — the boost flow successfully attaches the published post on the connected Page (via its Page-owned object_story_id) to the new ad on the connected Ad Account.",
    ],
    expectedOutcome: "Boost-eligible posts on the connected Page are discoverable and attachable as ad creative.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "ready",
    verifiedAt: "2026-05-05",
  },
  {
    scope: "pages_read_engagement",
    app: "ads",
    workflowStage: "connect",
    description: "Used by the Ads app to identify which posts on the connected Page are boost candidates based on organic performance.",
    whyWeNeed:
      "Boost candidates are surfaced in the Promote module ranked by organic engagement on the connected Page (likes, comments, shares, reach). This scope on the Ads app enables the boost-candidate selection UI to display engagement counts for ranking.",
    testSteps: [
      "Navigate to 'Promote' → 'Boost a post'.",
      "Observe the list of recent published posts on the connected Page annotated with engagement counts (likes, comments, shares).",
      "Select a high-engagement post to boost.",
    ],
    expectedOutcome: "The boost-candidate list shows organic engagement metrics for each post on the connected Page, sourced via this scope.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "VERIFY: Promote → 'Boost a post' surface displays per-post engagement counts (likes, comments, shares) on each candidate",
      "VERIFY: candidate list ordering reflects engagement (best performers near top) — that's what justifies this scope being on the Ads app rather than just relying on the Pages-app version",
    ],
  },

  // ── Publish ─────────────────────────────────────────────────────────
  {
    scope: "ads_management",
    app: "ads",
    workflowStage: "publish",
    description: "Creates and manages paid campaigns (campaigns, ad sets, ads) on the connected Ad Account.",
    whyWeNeed:
      "TracPost's enterprise tier provides paid campaign management. The Quick Boost flow is the reference implementation of the Select → Recommend → Review → Trigger pattern: the subscriber selects an eligible boostable post on the connected Page, sees the TracPost platform's recommended budget/targeting/CTA, reviews the pre-boost summary, and clicks Boost. The TracPost platform then creates the campaign on the connected Ad Account via the Marketing API.",
    testSteps: [
      "Log in at https://app.tracpost.com/login with the credentials at the top of this page (acting as the subscriber, on the enterprise tier).",
      "Navigate to 'Promote' in the sidebar (visible only on enterprise tier).",
      "Connect a Meta Ad Account (one-click OAuth via the TracPost — Ads app, granting permissions on the connected Facebook account).",
      "Select a published post on the connected Page from the list of boost candidates.",
      "Review the prepared boost: daily budget, duration, targeting (local), CTA (Learn More).",
      "Click 'Boost'.",
      "Wait for the campaign to be created (~5 seconds).",
      "Open Meta Ads Manager in a separate tab and verify the campaign + ad set + ad exist on the connected Ad Account with the configured settings.",
    ],
    expectedOutcome:
      "The TracPost platform creates a Campaign + Ad Set + Ad on the connected Ad Account via the Marketing API. The campaign is visible in Meta Ads Manager with the configured budget, targeting, and creative.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "REFERENCE IMPLEMENTATION: Quick Boost is the proof-of-concept for the unified UX pattern — manual flow validated through real subscriber boosts. This scope is in the best shape of any in the review surface.",
      "TEST DATA: test2 must be on enterprise tier with the Promote module visible (verify before screencast)",
      "TEST DATA: at least one published post on the connected Page with non-zero engagement, surfaced as a boost candidate",
      "VERIFY: screencast captures the round-trip — TracPost create → Meta Ads Manager verification on the connected Ad Account",
    ],
  },

  // ── Observe ─────────────────────────────────────────────────────────
  {
    scope: "ads_read",
    app: "ads",
    workflowStage: "observe",
    description: "Reads campaign, ad set, and ad performance data (impressions, clicks, spend, conversions) on the connected Ad Account.",
    whyWeNeed:
      "The subscriber sees how their boosted campaigns are performing within the TracPost app via the campaigns drill-down view. The 'View campaign' click is the user-initiated trigger for this scope's API call.",
    testSteps: [
      "Complete the ads_management test above to create a campaign on the connected Ad Account.",
      "Navigate to 'Promote' → click into the just-created campaign.",
      "Observe the drill-down view showing campaign hierarchy (Campaign → Ad Set → Ad) and per-entity insights (impressions, clicks, spend) once Meta has populated data (~30 min after launch).",
    ],
    expectedOutcome:
      "The TracPost app displays campaign performance metrics on the connected Ad Account, fetched live from the Marketing API as a result of the subscriber's drill-down click.",
    demoLink: "https://app.tracpost.com/dashboard/campaigns",
    status: "partial",
    gaps: [
      "VERIFY: campaign drill-down shows live insights data fetched via ads_read (not stubs)",
      "TIMING CONSTRAINT: insights data takes ~30 min to populate after campaign launch; screencast must be timed (launch campaign, wait, then record drill-down)",
      "VERIFY: the subscriber's 'view campaign' click is the visible trigger for the ads_read API call",
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
 * Permissions for one app, grouped by workflow stage in canonical stage
 * order. Empty stages are omitted — Ads has no Engage stage, for example.
 */
export function permissionsByAppAndStage(app: ReviewerApp): Array<{
  stage: WorkflowStage;
  permissions: ReviewerPermission[];
}> {
  const stagesInOrder: WorkflowStage[] = [
    "connect",
    "publish",
    "observe",
    "engage",
  ];
  return stagesInOrder
    .map((stage) => ({
      stage,
      permissions: PERMISSIONS.filter(
        (p) => p.app === app && p.workflowStage === stage,
      ),
    }))
    .filter((group) => group.permissions.length > 0);
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
export const PAGE_VERSION = "0.8";
export const LAST_UPDATED = "2026-05-05";

/**
 * Test credentials for the reviewer.
 *
 * The reviewer logs in with `email` / `password` (with a `recoveryCodes`
 * entry for 2FA backup) to act as the subscriber. The recovery codes are
 * single-use 2FA backup codes — used if the reviewer hits a 2FA prompt
 * and doesn't have access to the authenticator. Each code consumes only
 * when used.
 *
 * GAP: the reviewer also needs separate test Facebook account credentials
 * for the OAuth flow on the connected Facebook account (Meta App Review
 * standard practice — the reviewer doesn't use their personal FB account).
 * Add these credentials before submission.
 *
 * Rotate the full set of credentials after the review window closes.
 */
export const TEST_CREDENTIALS = {
  url: "https://app.tracpost.com/login",
  email: "test2@tracpost.com",
  password: "ReviewMe-2026!",
  recoveryCodes: [
    "1403 2192",
    "2170 9035",
    "5541 2167",
    "6037 8753",
    "6261 5408",
  ],
  notes:
    "Subscriber account 'test2' is on the enterprise tier with one site provisioned and onboarding marked complete. " +
    "The reviewer logs in with the credentials above to act as the subscriber and lands directly in the dashboard — the onboarding wizard is bypassed. " +
    "All three Meta apps (Pages, Visual, Ads) can be connected end-to-end with this account. " +
    "Credentials will be rotated after the review window closes.",
};
