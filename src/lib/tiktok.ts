/**
 * TikTok OAuth + API utilities.
 *
 * Env vars required:
 *   TIKTOK_CLIENT_KEY     — from developers.tiktok.com
 *   TIKTOK_CLIENT_SECRET  — from developers.tiktok.com
 *   NEXT_PUBLIC_APP_URL   — e.g. https://tracpost.com
 */

const API_BASE = "https://open.tiktokapis.com/v2";

/**
 * Build TikTok OAuth authorization URL.
 * Uses Authorization Code flow with PKCE-optional.
 */
export function getTikTokAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/tiktok/callback`,
    scope: "user.info.basic,video.publish,video.upload",
    response_type: "code",
    state,
  });

  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeTikTokCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  openId: string;
}> {
  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/tiktok/callback`,
    }),
  });

  const raw = await res.json();
  console.log("TikTok token exchange response:", JSON.stringify(raw));

  // TikTok v2 may nest under `data` or return at top level
  const data = raw.data || raw;

  if (!res.ok || data.error_code || data.error) {
    throw new Error(
      `TikTok token exchange failed: ${JSON.stringify(data.error_description || data.description || data.error || data)}`
    );
  }

  const accessToken = data.access_token;
  if (!accessToken) {
    throw new Error(`TikTok token exchange: no access_token in response: ${JSON.stringify(raw)}`);
  }

  return {
    accessToken,
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || 86400,
    openId: data.open_id || "",
  };
}

/**
 * Fetch the authenticated user's basic profile info.
 */
export async function getTikTokUserInfo(accessToken: string): Promise<{
  openId: string;
  displayName: string;
  avatarUrl: string;
  username: string;
}> {
  const res = await fetch(`${API_BASE}/user/info/?fields=open_id,display_name,avatar_url,username`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const raw = await res.json();
  console.log("TikTok user info response:", JSON.stringify(raw));

  const data = raw.data || raw;

  if (!res.ok || data.error_code || data.error) {
    throw new Error(
      `TikTok user info failed: ${JSON.stringify(data.error_description || data.description || data.error || data)}`
    );
  }

  const user = data.user || data;
  return {
    openId: user.open_id || "",
    displayName: user.display_name || "",
    avatarUrl: user.avatar_url || "",
    username: user.username || "",
  };
}
