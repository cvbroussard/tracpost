/**
 * Google Site Verification API — automated Search Console property setup.
 *
 * Flow:
 * 1. Request verification token (META tag method)
 * 2. Store token on the site so it's served in <head>
 * 3. Call verify to confirm ownership
 * 4. Add as Search Console property
 */
import { sql } from "@/lib/db";

const VERIFICATION_API = "https://www.googleapis.com/siteVerification/v1";

/**
 * Get a verification token for a domain using META tag method.
 */
async function getVerificationToken(
  accessToken: string,
  domain: string,
): Promise<{ token: string; method: string } | null> {
  const res = await fetch(`${VERIFICATION_API}/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      site: {
        type: "SITE",
        identifier: `https://${domain}/`,
      },
      verificationMethod: "META",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn("GSC getToken failed:", res.status, text.slice(0, 200));
    return null;
  }

  const data = await res.json();
  return {
    token: data.token as string,
    method: data.method as string,
  };
}

/**
 * Verify the site after the meta tag is in place.
 */
async function verifySite(
  accessToken: string,
  domain: string,
): Promise<boolean> {
  const res = await fetch(`${VERIFICATION_API}/webResource?verificationMethod=META`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      site: {
        type: "SITE",
        identifier: `https://${domain}/`,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn("GSC verify failed:", res.status, text.slice(0, 200));
    return false;
  }

  return true;
}

/**
 * Full auto-verification flow for a site's custom domain.
 *
 * 1. Get META verification token from Google
 * 2. Store it on the site (gsc_verification_token column)
 * 3. Verify with Google (requires the token to be served on the live site)
 * 4. Store gsc_property on success
 *
 * Returns: { status, token?, property? }
 */
export async function autoVerifyDomain(
  siteId: string,
  accessToken: string,
  customDomain: string,
): Promise<{
  status: "verified" | "token_stored" | "failed";
  token?: string;
  property?: string;
  error?: string;
}> {
  // Step 1: Get verification token
  const tokenResult = await getVerificationToken(accessToken, customDomain);
  if (!tokenResult) {
    return { status: "failed", error: "Could not get verification token from Google" };
  }

  // Step 2: Store the meta tag content on the site
  // The token looks like: <meta name="google-site-verification" content="xxxx" />
  // We extract just the content value
  const contentMatch = tokenResult.token.match(/content="([^"]+)"/);
  const metaContent = contentMatch ? contentMatch[1] : tokenResult.token;

  await sql`
    UPDATE businesses
    SET gsc_verification_token = ${metaContent}
    WHERE id = ${siteId}
  `;

  // Step 3: Try to verify immediately
  // This will only work if the site is already serving the meta tag.
  // On first call, we store the token and the next page render will include it.
  // The admin can retry verification after confirming the site is live.
  const verified = await verifySite(accessToken, customDomain);

  if (verified) {
    const property = `https://${customDomain}/`;
    await sql`UPDATE businesses SET gsc_property = ${property} WHERE id = ${siteId}`;
    return { status: "verified", token: metaContent, property };
  }

  // Token stored but not yet verified — site needs to serve the tag first
  return { status: "token_stored", token: metaContent };
}
