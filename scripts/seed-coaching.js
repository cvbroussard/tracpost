/**
 * Seed coaching content — all 7 platform walkthroughs.
 *
 * Idempotent: UPSERTs each walkthrough + each node. Re-running resets
 * to factory defaults. Operator can edit coaching_walkthroughs and
 * coaching_nodes rows directly between runs.
 *
 * Each platform is a directed graph of nodes:
 *   question:    branches based on user's existing setup
 *   instruction: a single setup step (title + body + optional screenshot + deep link)
 *   terminal:    end of guide; renders the actual Connect/OAuth button
 *
 * Screenshot URLs are placeholders — operator will capture real
 * screenshots later and upload to /public/onboarding/{platform}/.
 *
 * Usage:
 *   node scripts/seed-coaching.js              # seed all platforms
 *   node scripts/seed-coaching.js meta gbp     # seed specific ones
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const WALKTHROUGHS = [
  // ─── Meta (Facebook + Instagram) ────────────────────────────────────
  {
    platform: "meta",
    title: "Connect Facebook & Instagram",
    subtitle: "One connection covers both",
    estimated_time: "10–20 minutes if starting from scratch · 2 minutes if already set up",
    start: "q_personal_fb",
    nodes: [
      {
        id: "q_personal_fb",
        type: "question",
        content: {
          question: "Do you have a personal Facebook account?",
          help: "Facebook requires a personal account to own and manage a Business Page — that's a Facebook rule, not a TracPost one. TracPost will publish to your Business Page; it will never touch your personal Facebook profile.",
          options: [
            { label: "Yes, I have one", next: "q_business_page" },
            { label: "No, I need to create one", next: "i_create_personal" },
          ],
        },
      },
      {
        id: "i_create_personal",
        type: "instruction",
        content: {
          title: "Create your personal Facebook account",
          body: "Use your business email (or a personal email — doesn't matter). This personal account exists only to be the owner-of-record for your Business Page. TracPost will publish content to your Business Page on your behalf, but it will never publish to, read from, or interact with your personal Facebook profile.",
          bullets: [
            "Use a real name (Facebook flags fake-name accounts)",
            "Verify with phone or email — prevents the new account from being limited",
            "You don't need to add friends, post, or use Facebook personally",
            "TracPost only ever interacts with the Business Page you'll create next — your personal profile stays private and untouched",
          ],
          deep_link: "https://www.facebook.com/r.php",
          deep_link_label: "Open Facebook signup",
          screenshot: "/onboarding/meta/01-fb-signup.png",
          screenshot_alt: "Facebook signup page",
          next: "q_business_page",
        },
      },
      {
        id: "q_business_page",
        type: "question",
        content: {
          question: "Do you have a Facebook Business Page for your business?",
          help: "A Business Page is different from a personal profile. It has its own name, About section, hours, and photos.",
          options: [
            { label: "Yes, I have a Business Page", next: "q_instagram" },
            { label: "No, I need to create one", next: "i_create_page" },
            { label: "I'm not sure", next: "i_check_pages" },
          ],
        },
      },
      {
        id: "i_check_pages",
        type: "instruction",
        content: {
          title: "Check if you already have a Page",
          body: "Sign in to facebook.com, click the menu (☰) in the top right or your profile photo. Look under 'Pages' or 'Your Pages'. If you see your business name listed there, you have a Page.",
          deep_link: "https://www.facebook.com/pages",
          deep_link_label: "Open My Pages",
          screenshot: "/onboarding/meta/02-check-pages.png",
          screenshot_alt: "Facebook Pages list",
          next: "q_business_page",
        },
      },
      {
        id: "i_create_page",
        type: "instruction",
        content: {
          title: "Create your Business Page",
          body: "Open Facebook's Page creation tool. You'll fill in your business name, pick a category, add a short description, and upload a profile photo + cover image.",
          bullets: [
            "Page name = your actual business name (changing it later is restricted)",
            "Pick the closest category — refine after",
            "Profile photo: your logo (or a clean photo of your work)",
            "Cover image: 820 × 312 px hero shot",
            "Add address, hours, website, phone — even basic info helps",
          ],
          deep_link: "https://www.facebook.com/pages/create",
          deep_link_label: "Open Page creation",
          screenshot: "/onboarding/meta/03-create-page.png",
          screenshot_alt: "Facebook Page creation form",
          next: "q_instagram",
        },
      },
      {
        id: "q_instagram",
        type: "question",
        content: {
          question: "Do you have an Instagram account for your business?",
          help: "Brand-new or existing — we just need it to exist before linking.",
          options: [
            { label: "Yes, I have one", next: "q_ig_business" },
            { label: "No, I need to create one", next: "i_create_instagram" },
          ],
        },
      },
      {
        id: "i_create_instagram",
        type: "instruction",
        content: {
          title: "Create your business Instagram account",
          body: "On the Instagram app or instagram.com, sign up with your business email. Pick a handle (@yourbusinessname or similar). Add a profile photo (your logo).",
          bullets: [
            "Use your business email — keeps it separate from any personal Instagram",
            "Handle should match your business name as closely as possible",
            "Profile photo: your logo, square crop",
            "Bio: one short sentence describing what you do",
          ],
          deep_link: "https://www.instagram.com/accounts/emailsignup/",
          deep_link_label: "Open Instagram signup",
          screenshot: "/onboarding/meta/04-ig-signup.png",
          screenshot_alt: "Instagram signup screen",
          next: "q_ig_business",
        },
      },
      {
        id: "q_ig_business",
        type: "question",
        content: {
          question: "Is your Instagram a Business or Creator account, AND linked to your Facebook Page?",
          help: "Both conditions must be true. TracPost can only publish to Instagram via the Facebook Graph API when these are met.",
          options: [
            { label: "Yes, both are true", next: "t_ready" },
            { label: "I need to convert / link it", next: "i_convert_ig" },
            { label: "I'm not sure", next: "i_check_ig_type" },
          ],
        },
      },
      {
        id: "i_check_ig_type",
        type: "instruction",
        content: {
          title: "Check your Instagram account type",
          body: "On the Instagram app: Profile → ☰ menu → Settings and privacy → Account type and tools. If you see 'Switch to professional account', it's currently Personal. If you see 'Switch account type', it's already Professional (Business or Creator).",
          bullets: [
            "Personal → switch to Business",
            "Creator → works for TracPost too, no need to change",
            "Business → ideal, just verify the Page link",
          ],
          screenshot: "/onboarding/meta/05-ig-account-type.png",
          screenshot_alt: "Instagram Account type and tools settings",
          next: "q_ig_business",
        },
      },
      {
        id: "i_convert_ig",
        type: "instruction",
        content: {
          title: "Convert Instagram to Business + link to your Page",
          body: "On the Instagram app (this can't be done from instagram.com on desktop): Profile → ☰ → Settings and privacy → Account type and tools → Switch to professional account → Business → pick a category. When prompted, link to your Facebook Page.",
          bullets: [
            "Switch to professional account → Business (not Creator unless you publish creator-style content)",
            "Pick the category that matches your business",
            "When asked to connect to a Facebook Page, pick the Business Page you created earlier",
            "If the Page isn't listed: open Facebook app, sign in, then return to Instagram",
          ],
          screenshot: "/onboarding/meta/06-ig-link-page.png",
          screenshot_alt: "Instagram Connect to Facebook Page screen",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect Meta",
          body: "When you click Connect below, Facebook will open a permission dialog. TracPost will request access to your Page and linked Instagram account. Approve all permissions — we only request what's needed to publish and read engagement.",
          action: "connect",
          action_label: "Connect Facebook & Instagram",
        },
      },
    ],
  },

  // ─── Google Business Profile ───────────────────────────────────────
  {
    platform: "gbp",
    title: "Connect Google Business Profile",
    subtitle: "Critical for local search",
    estimated_time: "5 minutes if verified · 4–7 days if you need new verification",
    start: "q_google_account",
    nodes: [
      {
        id: "q_google_account",
        type: "question",
        content: {
          question: "Do you have a Google account (Gmail or Google Workspace)?",
          help: "You need a Google account to own and manage a Business Profile. Personal Gmail or business Workspace email both work.",
          options: [
            { label: "Yes", next: "q_has_profile" },
            { label: "No, I need to create one", next: "i_create_google" },
          ],
        },
      },
      {
        id: "i_create_google",
        type: "instruction",
        content: {
          title: "Create your Google account",
          body: "Use your business email if you have one. If your domain is on Google Workspace already, you can sign in with that. Otherwise create a free Gmail account dedicated to managing the business profile.",
          deep_link: "https://accounts.google.com/signup",
          deep_link_label: "Open Google account signup",
          screenshot: "/onboarding/gbp/01-google-signup.png",
          screenshot_alt: "Google account signup page",
          next: "q_has_profile",
        },
      },
      {
        id: "q_has_profile",
        type: "question",
        content: {
          question: "Do you already have a Google Business Profile?",
          help: "Search your business name on Google Maps. If your business shows up with hours, photos, reviews — you have one (even if you didn't claim it yet).",
          options: [
            { label: "Yes, and I've claimed it", next: "q_verified" },
            { label: "It exists but I haven't claimed it", next: "i_claim_profile" },
            { label: "No, I need to create one", next: "i_create_profile" },
          ],
        },
      },
      {
        id: "i_claim_profile",
        type: "instruction",
        content: {
          title: "Claim your existing profile",
          body: "Search your business on Google Maps. Open the listing and look for 'Claim this business' or 'Own this business?' Sign in with the Google account you'll use for TracPost. Google will ask you to verify ownership (postcard mailed to your address, phone call, or video — depending on what's available for your business type).",
          deep_link: "https://www.google.com/business/",
          deep_link_label: "Open Google Business",
          screenshot: "/onboarding/gbp/02-claim-profile.png",
          screenshot_alt: "Google Business claim flow",
          next: "q_verified",
        },
      },
      {
        id: "i_create_profile",
        type: "instruction",
        content: {
          title: "Create your Business Profile",
          body: "Click 'Manage Now' on Google Business. Enter your business name, category, address (or service area for mobile businesses), phone, and website. Verify ownership when prompted — usually a postcard mailed in 4-7 days, sometimes phone or email for select business types.",
          bullets: [
            "Be precise with name + address — hard to change later",
            "Service area businesses (no storefront): pick the radius/cities you serve",
            "Postcard verification is the most common — watch your physical mailbox",
          ],
          deep_link: "https://business.google.com",
          deep_link_label: "Open Google Business",
          screenshot: "/onboarding/gbp/03-create-profile.png",
          screenshot_alt: "Google Business Profile creation",
          next: "q_verified",
        },
      },
      {
        id: "q_verified",
        type: "question",
        content: {
          question: "Is your Business Profile fully verified?",
          help: "After claiming or creating, Google requires verification before you can manage the listing or grant API access. Look for a green check or 'Verified' badge.",
          options: [
            { label: "Yes, verified", next: "t_ready" },
            { label: "No, still waiting", next: "i_verification_pending" },
          ],
        },
      },
      {
        id: "i_verification_pending",
        type: "instruction",
        content: {
          title: "Verification still pending",
          body: "TracPost needs the profile to be verified before it can connect. Postcard verification typically takes 4-7 days. Once you receive it, enter the code on business.google.com. Come back to this step when you see the green Verified badge.",
          bullets: [
            "If your postcard never arrives, you can request a second one after 14 days",
            "Some business types qualify for instant phone or email verification — check the Verify dialog",
            "You can come back to onboarding later — your progress is saved",
          ],
          deep_link: "https://business.google.com",
          deep_link_label: "Check verification status",
          screenshot: "/onboarding/gbp/04-verification-pending.png",
          screenshot_alt: "Google Business verification status screen",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect Google",
          body: "When you click Connect below, Google will ask you to sign in and grant TracPost permission to manage your Business Profile and read related data. Approve to continue.",
          action: "connect",
          action_label: "Connect Google Business",
        },
      },
    ],
  },

  // ─── LinkedIn ───────────────────────────────────────────────────────
  {
    platform: "linkedin",
    title: "Connect LinkedIn",
    subtitle: "Company Page only — not personal profiles",
    estimated_time: "5–10 minutes",
    start: "q_personal_linkedin",
    nodes: [
      {
        id: "q_personal_linkedin",
        type: "question",
        content: {
          question: "Do you have a personal LinkedIn account?",
          help: "LinkedIn requires a personal profile to create or admin a Company Page — their rule, not ours. TracPost will publish to your Company Page; it will never publish to your personal LinkedIn profile.",
          options: [
            { label: "Yes", next: "q_company_page" },
            { label: "No, I need to create one", next: "i_create_personal_linkedin" },
          ],
        },
      },
      {
        id: "i_create_personal_linkedin",
        type: "instruction",
        content: {
          title: "Create your personal LinkedIn account",
          body: "Use your business email. Fill in name, current job (your role at the business is fine), and basic location. You don't need to build out your profile heavily — it exists only to be the owner-of-record for your Company Page. TracPost only ever publishes to the Company Page; your personal LinkedIn stays private and untouched.",
          deep_link: "https://www.linkedin.com/signup",
          deep_link_label: "Open LinkedIn signup",
          screenshot: "/onboarding/linkedin/01-signup.png",
          screenshot_alt: "LinkedIn signup page",
          next: "q_company_page",
        },
      },
      {
        id: "q_company_page",
        type: "question",
        content: {
          question: "Do you have a Company Page for your business on LinkedIn?",
          help: "Different from your personal profile. Company Pages have their own name, logo, About, and posts feed.",
          options: [
            { label: "Yes, and I'm an Admin on it", next: "t_ready" },
            { label: "Yes, but I'm not an Admin", next: "i_get_admin" },
            { label: "No, I need to create one", next: "i_create_company_page" },
          ],
        },
      },
      {
        id: "i_get_admin",
        type: "instruction",
        content: {
          title: "Get added as Admin on the Company Page",
          body: "TracPost can only publish if you're an Admin or Content Admin on the Page. Ask the existing admin to add you: they go to your Company Page → Admin tools → Manage admins → Add admin → search for your LinkedIn name → assign Admin or Content Admin.",
          bullets: [
            "Admin role can also add other admins",
            "Content Admin can publish but not manage admins",
            "Either role works for TracPost",
          ],
          screenshot: "/onboarding/linkedin/02-add-admin.png",
          screenshot_alt: "LinkedIn Manage admins screen",
          next: "t_ready",
        },
      },
      {
        id: "i_create_company_page",
        type: "instruction",
        content: {
          title: "Create your Company Page",
          body: "From your personal LinkedIn, click the apps grid (top right) → For Business → Create a Company Page. Pick the page type (Company is the default for businesses), then fill in name, LinkedIn URL, website, industry, and company size.",
          bullets: [
            "Company name = your real business name",
            "LinkedIn URL: a slug like linkedin.com/company/yourbusiness",
            "Industry + company size are required even if approximate",
            "Add a logo (square) and tagline — pages without these can't be activated",
          ],
          deep_link: "https://www.linkedin.com/company/setup/new/",
          deep_link_label: "Create Company Page",
          screenshot: "/onboarding/linkedin/03-create-page.png",
          screenshot_alt: "LinkedIn Company Page creation form",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect LinkedIn",
          body: "When you click Connect below, LinkedIn will sign you in and ask permission to publish on behalf of your Company Page. Approve the requested scopes. Note: TracPost's company-page publishing is currently pending LinkedIn approval (CMA), so initial connection will use limited scopes — full publishing capability activates once LinkedIn approves.",
          action: "connect",
          action_label: "Connect LinkedIn",
        },
      },
    ],
  },

  // ─── YouTube ────────────────────────────────────────────────────────
  {
    platform: "youtube",
    title: "Connect YouTube",
    subtitle: "Brand channel, not personal",
    estimated_time: "5 minutes",
    start: "q_google_account",
    nodes: [
      {
        id: "q_google_account",
        type: "question",
        content: {
          question: "Do you have a Google account (Gmail or Google Workspace)?",
          help: "YouTube channels live under Google accounts. Same account you use for Google Business Profile is fine, or a separate one for the channel.",
          options: [
            { label: "Yes", next: "q_has_channel" },
            { label: "No, I need to create one", next: "i_create_google_yt" },
          ],
        },
      },
      {
        id: "i_create_google_yt",
        type: "instruction",
        content: {
          title: "Create your Google account",
          body: "If your business uses Google Workspace, sign in with that. Otherwise create a free Gmail account for the channel.",
          deep_link: "https://accounts.google.com/signup",
          deep_link_label: "Open Google signup",
          screenshot: "/onboarding/youtube/00-google-signup.png",
          screenshot_alt: "Google account signup page",
          next: "q_has_channel",
        },
      },
      {
        id: "q_has_channel",
        type: "question",
        content: {
          question: "Do you have a YouTube channel for your business?",
          help: "Distinct from your personal channel. A Brand Account channel is preferred — it can be transferred or shared with team members later.",
          options: [
            { label: "Yes, a Brand Account channel", next: "t_ready" },
            { label: "I have a personal channel only", next: "i_create_brand_channel" },
            { label: "No channel yet", next: "i_create_brand_channel" },
          ],
        },
      },
      {
        id: "i_create_brand_channel",
        type: "instruction",
        content: {
          title: "Create a Brand Account channel",
          body: "Sign in to YouTube → click your profile photo (top right) → Settings → 'See all channels or create a new one' → Create a new channel. Use a custom business name (this triggers Brand Account creation, separate from your personal name).",
          bullets: [
            "Brand Account channels can have multiple managers — useful for team access",
            "Use your business name exactly as it appears elsewhere",
            "Add a profile photo (your logo) and channel banner (2560 × 1440 ideal)",
            "You can verify the channel later via SMS — needed for uploads >15 minutes",
          ],
          deep_link: "https://www.youtube.com/channel_switcher",
          deep_link_label: "Open channel switcher",
          screenshot: "/onboarding/youtube/01-create-channel.png",
          screenshot_alt: "YouTube create channel dialog",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect YouTube",
          body: "When you click Connect below, Google will ask you to choose which channel to grant access to and approve the requested permissions (upload videos, read analytics).",
          action: "connect",
          action_label: "Connect YouTube",
        },
      },
    ],
  },

  // ─── Pinterest ──────────────────────────────────────────────────────
  {
    platform: "pinterest",
    title: "Connect Pinterest",
    subtitle: "Business account",
    estimated_time: "5 minutes",
    start: "q_has_account",
    nodes: [
      {
        id: "q_has_account",
        type: "question",
        content: {
          question: "Do you have a Pinterest account?",
          help: "Personal or business — we just need it to exist. We'll convert/upgrade if needed.",
          options: [
            { label: "Yes, a Business account", next: "t_ready" },
            { label: "Yes, but it's Personal", next: "i_convert_to_business" },
            { label: "No, I need to create one", next: "i_create_business" },
          ],
        },
      },
      {
        id: "i_convert_to_business",
        type: "instruction",
        content: {
          title: "Convert to a Business account",
          body: "Sign in to pinterest.com → click the menu (▾ next to your profile) → Settings → Account management → Convert to business account. Add your business name, website, country, and language.",
          bullets: [
            "Free conversion — no fees, no review",
            "All your existing pins and boards stay",
            "Unlocks Pinterest analytics — see which pins drive engagement",
          ],
          deep_link: "https://www.pinterest.com/settings/account-settings",
          deep_link_label: "Open Pinterest settings",
          screenshot: "/onboarding/pinterest/01-convert.png",
          screenshot_alt: "Pinterest account settings",
          next: "t_ready",
        },
      },
      {
        id: "i_create_business",
        type: "instruction",
        content: {
          title: "Create a Business account",
          body: "Go to business.pinterest.com → Sign up. Use your business email. Add business name, website, country, and the categories that match what you do.",
          bullets: [
            "Use your business email — keeps it separate from any personal Pinterest",
            "Categories: pick 3-5 that align with your business",
            "Verify your website later (boosts visibility, optional)",
          ],
          deep_link: "https://business.pinterest.com",
          deep_link_label: "Open Pinterest Business signup",
          screenshot: "/onboarding/pinterest/02-create-business.png",
          screenshot_alt: "Pinterest Business signup",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect Pinterest",
          body: "When you click Connect below, Pinterest will sign you in and ask permission for TracPost to manage pins and read engagement data on your behalf.",
          action: "connect",
          action_label: "Connect Pinterest",
        },
      },
    ],
  },

  // ─── TikTok ─────────────────────────────────────────────────────────
  {
    platform: "tiktok",
    title: "Connect TikTok",
    subtitle: "Business account required",
    estimated_time: "10 minutes",
    start: "q_has_account",
    nodes: [
      {
        id: "q_has_account",
        type: "question",
        content: {
          question: "Do you have a TikTok account for your business?",
          help: "TikTok requires a Business account to publish via API. Personal accounts can't publish through tools like TracPost.",
          options: [
            { label: "Yes, it's a Business account", next: "t_ready" },
            { label: "Yes, but it's Personal", next: "i_switch_to_business" },
            { label: "No, I need to create one", next: "i_create_account" },
          ],
        },
      },
      {
        id: "i_create_account",
        type: "instruction",
        content: {
          title: "Create your TikTok account",
          body: "Go to tiktok.com/signup. Sign up with your business email. TikTok creates personal accounts by default — you'll switch to Business in the next step.",
          bullets: [
            "Must be 18+ to use TikTok",
            "Pick a handle that matches your business name as closely as possible",
            "Add a profile photo (your logo, square crop)",
            "Bio: short and clear — what you do",
          ],
          deep_link: "https://www.tiktok.com/signup",
          deep_link_label: "Open TikTok signup",
          screenshot: "/onboarding/tiktok/01-signup.png",
          screenshot_alt: "TikTok signup page",
          next: "i_switch_to_business",
        },
      },
      {
        id: "i_switch_to_business",
        type: "instruction",
        content: {
          title: "Switch to a Business account",
          body: "On the TikTok app: Profile → ☰ menu → Settings and privacy → Account → Switch to Business Account → pick a category. (Cannot be done from tiktok.com on desktop — use the mobile app.)",
          bullets: [
            "Free — no review or approval needed",
            "Adds analytics dashboard you can ignore if you want",
            "Reverts back to Personal anytime, but you'll lose API access then",
          ],
          screenshot: "/onboarding/tiktok/02-switch-business.png",
          screenshot_alt: "TikTok account switch to Business",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect TikTok",
          body: "When you click Connect below, TikTok will sign you in and ask permission for TracPost to publish videos and read engagement data. Note: TracPost's TikTok app is currently in their review queue — your connection may not complete until TikTok approves us. If that happens, mark TikTok as unavailable for now and we'll connect once approved.",
          action: "connect",
          action_label: "Connect TikTok",
        },
      },
    ],
  },

  // ─── X (Twitter) ────────────────────────────────────────────────────
  {
    platform: "twitter",
    title: "Connect X (Twitter)",
    subtitle: "Business profile",
    estimated_time: "5 minutes",
    start: "q_has_account",
    nodes: [
      {
        id: "q_has_account",
        type: "question",
        content: {
          question: "Do you have an X (Twitter) account for your business?",
          help: "Distinct from any personal X account. We recommend a dedicated business handle.",
          options: [
            { label: "Yes", next: "t_ready" },
            { label: "No, I need to create one", next: "i_create_account" },
          ],
        },
      },
      {
        id: "i_create_account",
        type: "instruction",
        content: {
          title: "Create your business X account",
          body: "Go to twitter.com signup. Use your business email. Pick a handle (@yourbusinessname). Complete the profile — photo, banner, bio, and a link to your website.",
          bullets: [
            "Handle should match your business name as closely as possible",
            "Profile photo: logo, square crop",
            "Header image: 1500 × 500 px",
            "Bio: short — what you do, who you serve, where",
            "Website link: your homepage",
          ],
          deep_link: "https://twitter.com/i/flow/signup",
          deep_link_label: "Open X signup",
          screenshot: "/onboarding/twitter/01-signup.png",
          screenshot_alt: "X (Twitter) signup page",
          next: "t_ready",
        },
      },
      {
        id: "t_ready",
        type: "terminal",
        content: {
          title: "Ready to connect X",
          body: "When you click Connect below, X will sign you in and ask permission for TracPost to read and write tweets on behalf of this account.",
          action: "connect",
          action_label: "Connect X (Twitter)",
        },
      },
    ],
  },
];

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const argFilter = process.argv.slice(2);
  const platforms = argFilter.length > 0 ? argFilter : WALKTHROUGHS.map((w) => w.platform);

  console.log(`seeding coaching: ${platforms.join(", ")}`);

  for (const platform of platforms) {
    const w = WALKTHROUGHS.find((x) => x.platform === platform);
    if (!w) {
      console.warn(`  ✗ ${platform}: no factory walkthrough defined, skipping`);
      continue;
    }

    await sql`
      INSERT INTO coaching_walkthroughs (platform, title, subtitle, estimated_time, start_node_id, updated_at)
      VALUES (${w.platform}, ${w.title}, ${w.subtitle || null}, ${w.estimated_time || null}, ${w.start}, NOW())
      ON CONFLICT (platform) DO UPDATE SET
        title          = EXCLUDED.title,
        subtitle       = EXCLUDED.subtitle,
        estimated_time = EXCLUDED.estimated_time,
        start_node_id  = EXCLUDED.start_node_id,
        updated_at     = NOW()
    `;

    let position = 0;
    for (const node of w.nodes) {
      await sql`
        INSERT INTO coaching_nodes (platform, id, type, content, position, updated_at)
        VALUES (${w.platform}, ${node.id}, ${node.type}, ${JSON.stringify(node.content)}::jsonb, ${position}, NOW())
        ON CONFLICT (platform, id) DO UPDATE SET
          type       = EXCLUDED.type,
          content    = EXCLUDED.content,
          position   = EXCLUDED.position,
          updated_at = NOW()
      `;
      position++;
    }

    console.log(`  ✓ ${platform}: ${w.nodes.length} nodes seeded`);
  }

  console.log("done");
})();
