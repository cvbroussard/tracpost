/**
 * Meta API test calls for App Review.
 * Runs required API calls to register test usage per permission.
 * Each call is made 3 times to ensure Meta logs them.
 */

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node run-fb-tests.js <USER_ACCESS_TOKEN>");
  process.exit(1);
}

const GRAPH = "https://graph.facebook.com/v21.0";
const CALLS_PER_TEST = 3;

async function api(path, label) {
  const url = `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      console.log(`  ✓ ${label} (${res.status})`);
      return data;
    } else {
      console.log(`  ✗ ${label} (${res.status}): ${data.error?.message || JSON.stringify(data.error)}`);
      return null;
    }
  } catch (err) {
    console.log(`  ✗ ${label}: ${err.message}`);
    return null;
  }
}

async function repeat(path, label, times = CALLS_PER_TEST) {
  let result = null;
  for (let i = 0; i < times; i++) {
    result = await api(path, `${label} [${i + 1}/${times}]`);
  }
  return result;
}

async function run() {
  console.log("=== META API TEST CALLS FOR APP REVIEW ===\n");

  // ── Step 1: Discover IDs ──
  console.log("── Discovering accounts ──");

  // public_profile + email
  const me = await api("/me?fields=id,name,email", "GET /me (public_profile + email)");
  if (!me) {
    console.error("\nFailed to get /me — token may be invalid");
    process.exit(1);
  }
  console.log(`  User: ${me.name} (${me.id}), Email: ${me.email || "not granted"}\n`);

  // pages_show_list
  const pages = await api("/me/accounts?fields=id,name,access_token,instagram_business_account", "GET /me/accounts (pages_show_list)");
  if (!pages?.data?.length) {
    console.error("\nNo Pages found — check permissions");
    process.exit(1);
  }

  const page = pages.data[0];
  const pageId = page.id;
  const pageToken = page.access_token;
  console.log(`  Page: ${page.name} (${pageId})`);

  // Instagram Business Account
  let igUserId = null;
  if (page.instagram_business_account) {
    igUserId = page.instagram_business_account.id;
    const igInfo = await api(`/${igUserId}?fields=username,media_count`, "GET IG profile");
    console.log(`  Instagram: @${igInfo?.username || igUserId} (${igInfo?.media_count || 0} media)\n`);
  } else {
    console.log("  Instagram: not linked to this Page\n");
  }

  // Ad accounts
  const adAccounts = await api("/me/adaccounts?fields=id,name,account_status", "GET /me/adaccounts");
  let adAccountId = null;
  if (adAccounts?.data?.length) {
    adAccountId = adAccounts.data[0].id;
    console.log(`  Ad Account: ${adAccounts.data[0].name} (${adAccountId})\n`);
  } else {
    console.log("  Ad Accounts: none found\n");
  }

  // Businesses
  const businesses = await api("/me/businesses?fields=id,name", "GET /me/businesses");
  if (businesses?.data?.length) {
    console.log(`  Business: ${businesses.data[0].name} (${businesses.data[0].id})\n`);
  }

  // ── Step 2: Run test calls (3x each) ──

  console.log("── public_profile ──");
  await repeat("/me?fields=id,name", "GET /me");

  console.log("\n── email ──");
  await repeat("/me?fields=email", "GET /me?fields=email");

  console.log("\n── pages_show_list ──");
  await repeat("/me/accounts?fields=id,name", "GET /me/accounts");

  console.log("\n── pages_read_engagement ──");
  await repeat(`/${pageId}/feed?fields=id,message,created_time&limit=5`, "GET /{page}/feed");

  console.log("\n── pages_manage_posts ──");
  await repeat(`/${pageId}/published_posts?fields=id,message&limit=5`, "GET /{page}/published_posts");

  console.log("\n── pages_manage_engagement ──");
  // Read comments on page posts
  const postList = await api(`/${pageId}/feed?fields=id&limit=1`, "GET first post for comments");
  if (postList?.data?.[0]) {
    const postId = postList.data[0].id;
    await repeat(`/${postId}/comments?fields=id,message,from&limit=5`, "GET /{post}/comments");
  } else {
    console.log("  ⚠ No posts to read comments from — publishing a test post may be needed");
    await repeat(`/${pageId}/feed?fields=id&limit=3`, "GET /{page}/feed (fallback)");
  }

  console.log("\n── pages_read_user_content ──");
  await repeat(`/${pageId}/feed?fields=from,message,comments{message,from}&limit=5`, "GET /{page}/feed with user content");

  console.log("\n── pages_manage_metadata ──");
  await repeat(`/${pageId}?fields=id,name,category,fan_count`, "GET /{page} metadata");

  console.log("\n── read_insights ──");
  await repeat(`/${pageId}/insights?metric=page_impressions&period=day&since=${daysAgo(7)}&until=${daysAgo(0)}`, "GET /{page}/insights (page_impressions)");

  console.log("\n── business_management ──");
  await repeat("/me/businesses?fields=id,name", "GET /me/businesses");

  // ── Instagram calls ──
  if (igUserId) {
    console.log("\n── instagram_basic ──");
    await repeat(`/${igUserId}?fields=id,username,media_count,account_type`, "GET /{ig-user}/profile");

    console.log("\n── instagram_content_publish ──");
    await repeat(`/${igUserId}/media?fields=id,caption,media_type,timestamp&limit=5`, "GET /{ig-user}/media");

    console.log("\n── instagram_manage_comments ──");
    const igMedia = await api(`/${igUserId}/media?fields=id&limit=1`, "GET first IG media for comments");
    if (igMedia?.data?.[0]) {
      await repeat(`/${igMedia.data[0].id}/comments?fields=id,text,from,timestamp&limit=5`, "GET /{ig-media}/comments");
    } else {
      console.log("  ⚠ No IG media found — post content first");
      await repeat(`/${igUserId}/media?fields=id&limit=3`, "GET /{ig-user}/media (fallback)");
    }

    console.log("\n── instagram_manage_insights ──");
    await repeat(`/${igUserId}/insights?metric=impressions,reach&period=day&since=${daysAgo(7)}&until=${daysAgo(0)}`, "GET /{ig-user}/insights");
  } else {
    console.log("\n⚠ Skipping Instagram calls — no IG account linked");
  }

  // ── Ads calls ──
  if (adAccountId) {
    console.log("\n── ads_management ──");
    await repeat(`/${adAccountId}/campaigns?fields=id,name,status&limit=5`, "GET /{ad-account}/campaigns");

    console.log("\n── ads_read ──");
    await repeat(`/${adAccountId}/insights?fields=impressions,clicks,spend&date_preset=last_30d`, "GET /{ad-account}/insights");

    console.log("\n── pages_manage_ads ──");
    await repeat(`/${adAccountId}/ads?fields=id,name,status&limit=5`, "GET /{ad-account}/ads");

    console.log("\n── Ads Management Standard Access ──");
    await repeat(`/${adAccountId}?fields=id,name,account_status,amount_spent`, "GET /{ad-account} info");
  } else {
    console.log("\n⚠ Skipping Ads calls — no ad account found");
    console.log("  You need an ad account linked to your Business Manager.");
    console.log("  Create one at: business.facebook.com → Ad accounts → Add");
  }

  console.log("\n=== DONE ===");
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

run().catch(console.error);
