/**
 * Meta API test calls for App Review — v2 (fixes Page token + metric names).
 * Uses Page Access Token for page-scoped endpoints.
 */

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node run-fb-tests-v2.js <USER_ACCESS_TOKEN>");
  process.exit(1);
}

const GRAPH = "https://graph.facebook.com/v21.0";
const CALLS_PER_TEST = 3;

async function api(path, label, token = TOKEN) {
  const url = `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${token}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      console.log(`  ✓ ${label} (${res.status})`);
      return data;
    } else {
      console.log(`  ✗ ${label} (${res.status}): ${data.error?.message?.slice(0, 120) || JSON.stringify(data.error).slice(0, 120)}`);
      return null;
    }
  } catch (err) {
    console.log(`  ✗ ${label}: ${err.message}`);
    return null;
  }
}

async function repeat(path, label, times = CALLS_PER_TEST, token = TOKEN) {
  let result = null;
  for (let i = 0; i < times; i++) {
    result = await api(path, `${label} [${i + 1}/${times}]`, token);
  }
  return result;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function run() {
  console.log("=== META API TEST CALLS FOR APP REVIEW (v2) ===\n");

  // ── Step 1: Discover IDs + Page Token ──
  console.log("── Discovering accounts ──");

  const me = await api("/me?fields=id,name,email", "GET /me");
  if (!me) { console.error("Token invalid"); process.exit(1); }
  console.log(`  User: ${me.name} (${me.id})\n`);

  const pages = await api("/me/accounts?fields=id,name,access_token,instagram_business_account", "GET /me/accounts");
  if (!pages?.data?.length) { console.error("No Pages found"); process.exit(1); }

  const page = pages.data[0];
  const pageId = page.id;
  const PAGE_TOKEN = page.access_token;
  console.log(`  Page: ${page.name} (${pageId})`);
  console.log(`  Page Token: ${PAGE_TOKEN ? "obtained" : "MISSING"}`);

  let igUserId = null;
  if (page.instagram_business_account) {
    igUserId = page.instagram_business_account.id;
    const igInfo = await api(`/${igUserId}?fields=username,media_count`, "GET IG profile");
    console.log(`  Instagram: @${igInfo?.username} (${igInfo?.media_count} media)`);
  }

  const adAccounts = await api("/me/adaccounts?fields=id,name", "GET /me/adaccounts");
  let adAccountId = null;
  if (adAccounts?.data?.length) {
    adAccountId = adAccounts.data[0].id;
    console.log(`  Ad Account: ${adAccounts.data[0].name} (${adAccountId})`);
  }

  console.log("");

  // ── Step 2: User-token calls ──

  console.log("── public_profile ──");
  await repeat("/me?fields=id,name", "GET /me");

  console.log("\n── email ──");
  await repeat("/me?fields=email", "GET /me?fields=email");

  console.log("\n── pages_show_list ──");
  await repeat("/me/accounts?fields=id,name", "GET /me/accounts");

  console.log("\n── business_management ──");
  await repeat("/me/businesses?fields=id,name", "GET /me/businesses");

  // ── Step 3: Page-token calls ──

  console.log("\n── pages_read_engagement (page token) ──");
  await repeat(`/${pageId}/feed?fields=id,message,created_time&limit=5`, "GET /{page}/feed", CALLS_PER_TEST, PAGE_TOKEN);

  console.log("\n── pages_manage_posts (page token) ──");
  await repeat(`/${pageId}/published_posts?fields=id,message&limit=5`, "GET /{page}/published_posts", CALLS_PER_TEST, PAGE_TOKEN);

  console.log("\n── pages_manage_engagement (page token) ──");
  const postList = await api(`/${pageId}/feed?fields=id&limit=1`, "GET first post", PAGE_TOKEN);
  if (postList?.data?.[0]) {
    const postId = postList.data[0].id;
    await repeat(`/${postId}/comments?fields=id,message,from&limit=5`, "GET /{post}/comments", CALLS_PER_TEST, PAGE_TOKEN);
  } else {
    await repeat(`/${pageId}/feed?fields=id,message&limit=3`, "GET /{page}/feed (fallback)", CALLS_PER_TEST, PAGE_TOKEN);
  }

  console.log("\n── pages_read_user_content (page token) ──");
  await repeat(`/${pageId}/feed?fields=from,message,comments{message,from}&limit=5`, "GET /{page}/feed with user content", CALLS_PER_TEST, PAGE_TOKEN);

  console.log("\n── pages_manage_metadata (page token) ──");
  await repeat(`/${pageId}?fields=id,name,category,fan_count`, "GET /{page} metadata", CALLS_PER_TEST, PAGE_TOKEN);

  console.log("\n── read_insights (page token) ──");
  await repeat(`/${pageId}/insights?metric=page_views_total&period=day&since=${daysAgo(7)}&until=${daysAgo(0)}`, "GET /{page}/insights (page_views_total)", CALLS_PER_TEST, PAGE_TOKEN);

  console.log("\n── pages_messaging (page token) ──");
  await repeat(`/${pageId}/conversations?fields=id,updated_time&limit=3`, "GET /{page}/conversations", CALLS_PER_TEST, PAGE_TOKEN);

  // ── Step 4: Instagram calls ──

  if (igUserId) {
    console.log("\n── instagram_basic ──");
    await repeat(`/${igUserId}?fields=id,username,media_count`, "GET /{ig-user}/profile");

    console.log("\n── instagram_content_publish ──");
    await repeat(`/${igUserId}/media?fields=id,caption,media_type,timestamp&limit=5`, "GET /{ig-user}/media");

    console.log("\n── instagram_manage_comments ──");
    const igMedia = await api(`/${igUserId}/media?fields=id&limit=1`, "GET first IG media");
    if (igMedia?.data?.[0]) {
      await repeat(`/${igMedia.data[0].id}/comments?fields=id,text,from,timestamp&limit=5`, "GET /{ig-media}/comments");
    } else {
      await repeat(`/${igUserId}/media?fields=id&limit=3`, "GET /{ig-user}/media (fallback)");
    }

    console.log("\n── instagram_manage_insights ──");
    await repeat(`/${igUserId}/insights?metric=reach,follower_count&period=day&since=${daysAgo(7)}&until=${daysAgo(0)}`, "GET /{ig-user}/insights (reach, follower_count)");
  }

  // ── Step 5: Ads calls ──

  if (adAccountId) {
    console.log("\n── ads_management ──");
    await repeat(`/${adAccountId}/campaigns?fields=id,name,status&limit=5`, "GET /{ad-account}/campaigns");

    console.log("\n── ads_read ──");
    await repeat(`/${adAccountId}/insights?fields=impressions,clicks,spend&date_preset=last_30d`, "GET /{ad-account}/insights");

    console.log("\n── pages_manage_ads ──");
    await repeat(`/${adAccountId}/ads?fields=id,name,status&limit=5`, "GET /{ad-account}/ads");

    console.log("\n── Ads Management Standard Access ──");
    await repeat(`/${adAccountId}?fields=id,name,account_status,amount_spent`, "GET /{ad-account} info");
  }

  console.log("\n=== DONE ===");
  console.log("\nRefresh the Meta developer dashboard to see updated test call counts.");
}

run().catch(console.error);
