/**
 * LinkedIn OAuth 2.0 (Community Management API).
 *
 * Env vars:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL
 */

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

const SCOPES = "openid profile w_member_social";

/**
 * Build LinkedIn OAuth authorization URL.
 */
export function getLinkedInAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`,
    scope: SCOPES,
    state,
  });

  return `${AUTH_URL}?${params}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeLinkedInCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/linkedin/callback`,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `LinkedIn token exchange failed: ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || 5184000, // ~60 days
  };
}

/**
 * Fetch the authenticated user's profile via OpenID Connect userinfo.
 */
export async function getLinkedInUserInfo(accessToken: string): Promise<{
  sub: string;
  name: string;
}> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `LinkedIn user info failed: ${JSON.stringify(data)}`
    );
  }

  return {
    sub: data.sub,
    name: data.name || `${data.given_name || ""} ${data.family_name || ""}`.trim() || "LinkedIn User",
  };
}
