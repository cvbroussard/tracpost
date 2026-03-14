/**
 * Meta/Instagram OAuth + Graph API utilities.
 *
 * Env vars required:
 *   META_APP_ID        — from developers.facebook.com
 *   META_APP_SECRET    — from developers.facebook.com
 *   NEXT_PUBLIC_APP_URL — e.g. https://seosuite.com or http://localhost:3000
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export function getMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
    scope: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ].join(","),
    response_type: "code",
    state,
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

/**
 * Exchange authorization code for a short-lived token,
 * then exchange that for a long-lived token (~60 days).
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  // Step 1: Short-lived token
  const shortRes = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
    code,
  }));

  const shortData = await shortRes.json();
  if (!shortRes.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(shortData.error || shortData)}`);
  }

  // Step 2: Long-lived token
  const longRes = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortData.access_token,
  }));

  const longData = await longRes.json();
  if (!longRes.ok) {
    throw new Error(`Long-lived token exchange failed: ${JSON.stringify(longData.error || longData)}`);
  }

  return {
    accessToken: longData.access_token,
    expiresIn: longData.expires_in || 5184000, // ~60 days
  };
}

/**
 * Discover the Instagram Business Account ID connected to the user's
 * Facebook Pages. Returns all found IG accounts.
 */
export async function discoverInstagramAccounts(accessToken: string): Promise<Array<{
  igUserId: string;
  igUsername: string;
  pageName: string;
  pageId: string;
}>> {
  // Get all pages the user manages
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
  );
  const pagesData = await pagesRes.json();

  if (!pagesRes.ok) {
    throw new Error(`Pages fetch failed: ${JSON.stringify(pagesData.error || pagesData)}`);
  }

  const accounts: Array<{
    igUserId: string;
    igUsername: string;
    pageName: string;
    pageId: string;
  }> = [];

  for (const page of pagesData.data || []) {
    if (!page.instagram_business_account) continue;

    const igId = page.instagram_business_account.id;

    // Fetch IG username
    const igRes = await fetch(
      `${GRAPH_BASE}/${igId}?fields=username&access_token=${accessToken}`
    );
    const igData = await igRes.json();

    accounts.push({
      igUserId: igId,
      igUsername: igData.username || igId,
      pageName: page.name,
      pageId: page.id,
    });
  }

  return accounts;
}

/**
 * Refresh a long-lived token before it expires.
 * Can be refreshed as long as the current token is still valid.
 * Returns a new 60-day token.
 */
export async function refreshLongLivedToken(currentToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: currentToken,
  }));

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data.error || data)}`);
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000,
  };
}
