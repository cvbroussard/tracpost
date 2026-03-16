/**
 * Google OAuth 2.0 helpers for GBP (Google Business Profile).
 *
 * Handles auth URL generation, code→token exchange, and token refresh.
 * GBP scope: https://www.googleapis.com/auth/business.manage
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI =
  process.env.NODE_ENV === "production"
    ? "https://tracpost.com/api/auth/google/callback"
    : "http://localhost:3000/api/auth/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Build the Google OAuth consent URL.
 */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // get refresh token
    prompt: "consent", // force consent to always get refresh token
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
  googleAccountId: string;
}> {
  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokenData = await tokenRes.json();

  // Get user info for email + account ID
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const userData = await userRes.json();

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in || 3600,
    email: userData.email,
    googleAccountId: userData.id,
  };
}

/**
 * Refresh a Google access token using a refresh token.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Discover GBP accounts and locations for the authenticated user.
 */
export async function discoverGbpLocations(accessToken: string): Promise<
  Array<{
    accountId: string;
    accountName: string;
    locationId: string;
    locationName: string;
    address: string;
  }>
> {
  // List accounts
  const accountsRes = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!accountsRes.ok) {
    const err = await accountsRes.text();
    throw new Error(`Failed to list GBP accounts: ${err}`);
  }

  const accountsData = await accountsRes.json();
  const accounts = accountsData.accounts || [];
  const locations: Array<{
    accountId: string;
    accountName: string;
    locationId: string;
    locationName: string;
    address: string;
  }> = [];

  for (const account of accounts) {
    // account.name = "accounts/12345"
    const accountId = account.name;

    // List locations for this account
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,storefrontAddress`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!locRes.ok) continue;

    const locData = await locRes.json();
    for (const loc of locData.locations || []) {
      const addr = loc.storefrontAddress || {};
      const addressStr = [
        addr.addressLines?.join(", "),
        addr.locality,
        addr.administrativeArea,
      ]
        .filter(Boolean)
        .join(", ");

      locations.push({
        accountId: account.name,
        accountName: account.accountName || account.name,
        locationId: loc.name, // "accounts/123/locations/456"
        locationName: loc.title || "Unnamed Location",
        address: addressStr,
      });
    }
  }

  return locations;
}
