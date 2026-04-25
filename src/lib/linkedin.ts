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

const SCOPES = "openid profile w_member_social r_organization_social w_organization_social";

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
 * Fetch the authenticated user's profile.
 * Tries OpenID Connect userinfo first, falls back to /v2/me.
 */
export async function getLinkedInUserInfo(accessToken: string): Promise<{
  id: string;
  name: string;
}> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": "202401",
  };

  // Try OIDC userinfo first
  const userinfoRes = await fetch(USERINFO_URL, { headers });

  if (userinfoRes.ok) {
    const data = await userinfoRes.json();
    console.log("LinkedIn userinfo response:", JSON.stringify(data));
    if (data.sub) {
      return {
        id: data.sub,
        name: data.name || `${data.given_name || ""} ${data.family_name || ""}`.trim() || "LinkedIn User",
      };
    }
  } else {
    const errText = await userinfoRes.text();
    console.warn("LinkedIn userinfo failed, trying /v2/me:", errText);
  }

  // Fallback to /v2/me
  const meRes = await fetch("https://api.linkedin.com/v2/me", { headers });

  const meData = await meRes.json();
  console.log("LinkedIn /v2/me response:", JSON.stringify(meData));

  if (!meRes.ok) {
    throw new Error(`LinkedIn profile fetch failed: ${JSON.stringify(meData)}`);
  }

  return {
    id: meData.id,
    name: `${meData.localizedFirstName || ""} ${meData.localizedLastName || ""}`.trim() || "LinkedIn User",
  };
}

/**
 * Discover LinkedIn organizations (Company Pages) the user is admin of.
 */
export async function discoverLinkedInOrganizations(accessToken: string): Promise<Array<{
  orgId: string;
  orgName: string;
  vanityName: string;
}>> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": "202401",
  };

  // Get org admin roles
  const aclRes = await fetch(
    "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,vanityName)))",
    { headers }
  );

  if (!aclRes.ok) {
    const errText = await aclRes.text();
    console.warn("LinkedIn org discovery failed:", errText);
    return [];
  }

  const data = await aclRes.json();
  const elements = data.elements || [];

  return elements
    .filter((el: Record<string, unknown>) => el["organization~"])
    .map((el: Record<string, unknown>) => {
      const org = el["organization~"] as Record<string, unknown>;
      return {
        orgId: String(org.id || ""),
        orgName: String(org.localizedName || ""),
        vanityName: String(org.vanityName || ""),
      };
    });
}
