/**
 * Meta/Instagram OAuth + Graph API utilities.
 *
 * Env vars required:
 *   META_APP_ID        — from developers.facebook.com
 *   META_APP_SECRET    — from developers.facebook.com
 *   NEXT_PUBLIC_APP_URL — e.g. https://tracpost.com or http://localhost:3099
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export function getMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
    scope: [
      "instagram_basic",
      "instagram_content_publish",
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
 * Discover the Instagram Business Account connected to a Facebook Page.
 *
 * Two strategies:
 * 1. Try me/accounts (works when Meta cooperates)
 * 2. If empty, query known Page IDs directly (fallback for Dev mode quirks)
 */
export async function discoverInstagramAccounts(
  accessToken: string,
  pageIds?: string[]
): Promise<Array<{
  igUserId: string;
  igUsername: string;
  pageName: string;
  pageId: string;
}>> {
  const accounts: Array<{
    igUserId: string;
    igUsername: string;
    pageName: string;
    pageId: string;
  }> = [];

  // Strategy 1: me/accounts
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
  );
  const pagesData = await pagesRes.json();
  console.log("me/accounts response:", JSON.stringify(pagesData));

  if (pagesRes.ok && pagesData.data?.length > 0) {
    for (const page of pagesData.data) {
      if (!page.instagram_business_account) continue;
      const ig = await fetchIgAccount(page.instagram_business_account.id, page, accessToken);
      if (ig) accounts.push(ig);
    }
  }

  // Strategy 2: Direct Page ID queries (fallback)
  if (accounts.length === 0 && pageIds && pageIds.length > 0) {
    console.log("me/accounts empty — trying direct Page queries for:", pageIds);
    for (const pageId of pageIds) {
      const pageUrl = `${GRAPH_BASE}/${pageId}?fields=id,name,instagram_business_account&access_token=${accessToken}`;
      console.log("Querying Page:", pageId);
      const pageRes = await fetch(pageUrl);
      const pageData = await pageRes.json();
      console.log("Page query response:", pageRes.status, JSON.stringify(pageData));
      if (pageRes.ok && pageData.instagram_business_account) {
        const ig = await fetchIgAccount(pageData.instagram_business_account.id, pageData, accessToken);
        if (ig) accounts.push(ig);
      }
    }
  }

  return accounts;
}

async function fetchIgAccount(
  igId: string,
  page: { id: string; name: string },
  accessToken: string
): Promise<{ igUserId: string; igUsername: string; pageName: string; pageId: string } | null> {
  const igRes = await fetch(
    `${GRAPH_BASE}/${igId}?fields=username&access_token=${accessToken}`
  );
  const igData = await igRes.json();
  if (!igRes.ok) return null;

  return {
    igUserId: igId,
    igUsername: igData.username || igId,
    pageName: page.name,
    pageId: page.id,
  };
}

/**
 * Discover Facebook Pages the user manages, with their Page access tokens.
 * Page tokens from a long-lived user token are themselves long-lived.
 */
export async function discoverFacebookPages(
  accessToken: string,
  pageIds?: string[]
): Promise<Array<{
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}>> {
  const pages: Array<{
    pageId: string;
    pageName: string;
    pageAccessToken: string;
  }> = [];

  // Strategy 1: me/accounts with access_token field
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
  );
  const pagesData = await pagesRes.json();

  if (pagesRes.ok && pagesData.data?.length > 0) {
    for (const page of pagesData.data) {
      pages.push({
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
      });
    }
  }

  // Strategy 2: Direct Page ID queries (fallback)
  if (pages.length === 0 && pageIds && pageIds.length > 0) {
    for (const pageId of pageIds) {
      const pageRes = await fetch(
        `${GRAPH_BASE}/${pageId}?fields=id,name,access_token&access_token=${accessToken}`
      );
      const pageData = await pageRes.json();
      if (pageRes.ok && pageData.access_token) {
        pages.push({
          pageId: pageData.id,
          pageName: pageData.name,
          pageAccessToken: pageData.access_token,
        });
      }
    }
  }

  return pages;
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
