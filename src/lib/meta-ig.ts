/**
 * TracPost — Visual-IG OAuth + Instagram Graph API utilities.
 *
 * This module handles the organic Instagram connection via the
 * Instagram Login API (instagram.com OAuth, NOT facebook.com OAuth).
 * The IG account does NOT need to be Page-linked at Meta for organic
 * publishing — that's the whole point of the decoupling.
 *
 * Per the three-app Meta architecture:
 *   - TracPost — Pages   → lib/meta.ts     (organic FB Pages)
 *   - TracPost — Visual-IG → this module   (organic IG via IG Login API)
 *   - TracPost — Ads      → lib/meta-ads.ts (paid Marketing API)
 *
 * Env vars required:
 *   META_VISUAL_APP_ID     — TracPost — Visual-IG app on Meta Developer Dashboard
 *   META_VISUAL_APP_SECRET — corresponding secret
 *   NEXT_PUBLIC_APP_URL
 */

const IG_AUTHORIZE_URL = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_LONG_LIVED_URL = "https://graph.instagram.com/access_token";
const IG_GRAPH_BASE = "https://graph.instagram.com";

const IG_REDIRECT_PATH = "/api/auth/visual-ig/callback";

export const IG_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_insights",
];

export function getInstagramAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_VISUAL_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}${IG_REDIRECT_PATH}`,
    scope: IG_REQUIRED_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `${IG_AUTHORIZE_URL}?${params}`;
}

/**
 * Exchange the authorization code for a short-lived IG token (1h).
 * Returns the IG user ID alongside (it's bundled in the response).
 */
export async function exchangeIgCodeForToken(code: string): Promise<{
  shortToken: string;
  igUserId: string;
}> {
  const body = new URLSearchParams({
    client_id: process.env.META_VISUAL_APP_ID!,
    client_secret: process.env.META_VISUAL_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}${IG_REDIRECT_PATH}`,
    code,
  });
  const res = await fetch(IG_TOKEN_URL, { method: "POST", body });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`IG token exchange failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    shortToken: String(data.access_token),
    igUserId: String(data.user_id),
  };
}

/**
 * Exchange short-lived token for a long-lived token (~60 days).
 */
export async function exchangeIgShortForLong(shortToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const url = `${IG_LONG_LIVED_URL}?` + new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: process.env.META_VISUAL_APP_SECRET!,
    access_token: shortToken,
  });
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`IG long-lived token exchange failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    accessToken: String(data.access_token),
    expiresIn: Number(data.expires_in || 5184000),
  };
}

/**
 * Fetch the IG user profile. Used to identify the OAuth grant owner
 * and to populate the asset_name when storing.
 */
export async function getIgUserInfo(accessToken: string): Promise<{
  id: string;
  username: string;
  name: string | null;
  accountType: string;       // 'BUSINESS' | 'CREATOR' | 'PERSONAL' (PERSONAL would be rejected)
}> {
  const fields = "id,username,name,account_type";
  const res = await fetch(`${IG_GRAPH_BASE}/me?fields=${fields}&access_token=${accessToken}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`IG user info fetch failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    id: String(data.id),
    username: String(data.username),
    name: data.name ? String(data.name) : null,
    accountType: String(data.account_type || ""),
  };
}

/**
 * Verify the granted scopes match what TracPost requires. Per the
 * partial-grant policy, partial grants are rejected — subscriber is
 * re-prompted to reconnect with full consent. Avoids the "looks
 * connected, doesn't work" state.
 */
export async function getGrantedScopes(accessToken: string): Promise<string[]> {
  const res = await fetch(`${IG_GRAPH_BASE}/me/permissions?access_token=${accessToken}`);
  const data = await res.json();
  if (!res.ok) return [];
  if (!Array.isArray(data.data)) return [];
  return data.data
    .filter((p: Record<string, unknown>) => p.status === "granted")
    .map((p: Record<string, unknown>) => String(p.permission));
}

export function missingRequiredScopes(grantedScopes: string[]): string[] {
  return IG_REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));
}
