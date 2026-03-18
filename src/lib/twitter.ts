/**
 * X/Twitter OAuth 2.0 with PKCE.
 *
 * Env vars:
 *   TWITTER_CLIENT_ID
 *   TWITTER_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL
 */
import { randomBytes, createHash } from "node:crypto";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const USER_URL = "https://api.x.com/2/users/me";

/**
 * Generate PKCE code verifier and challenge.
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Build X OAuth authorization URL.
 * Returns the URL and the code_verifier (must be stored for token exchange).
 */
export function getTwitterAuthUrl(state: string): { authUrl: string; codeVerifier: string } {
  const { codeVerifier, codeChallenge } = generatePKCE();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.TWITTER_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/twitter/callback`,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    authUrl: `${AUTH_URL}?${params}`,
    codeVerifier,
  };
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeTwitterCode(
  code: string,
  codeVerifier: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/twitter/callback`,
      code_verifier: codeVerifier,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `Twitter token exchange failed: ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || 7200,
  };
}

/**
 * Fetch the authenticated user's profile.
 */
export async function getTwitterUserInfo(accessToken: string): Promise<{
  id: string;
  username: string;
  name: string;
}> {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok || data.errors) {
    throw new Error(
      `Twitter user info failed: ${JSON.stringify(data.errors || data)}`
    );
  }

  return {
    id: data.data.id,
    username: data.data.username,
    name: data.data.name,
  };
}
