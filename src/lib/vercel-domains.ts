/**
 * Vercel Domain Management API.
 *
 * Adds/removes custom domains on the TracPost Vercel project.
 * Used for blog custom domain provisioning.
 *
 * Env vars:
 *   VERCEL_TOKEN — Vercel API token (from dashboard → tokens)
 *   VERCEL_PROJECT_ID — TracPost project ID
 *   VERCEL_TEAM_ID — Team/scope ID (optional for personal accounts)
 */

const API_BASE = "https://api.vercel.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

/**
 * Add a custom domain to the Vercel project.
 * Returns the domain config including any required DNS records for verification.
 */
export async function addDomain(domain: string): Promise<{
  success: boolean;
  error?: string;
  verification?: Array<{ type: string; domain: string; value: string }>;
  apexName?: string;
  cnames?: Array<{ name: string; value: string }>;
}> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    console.warn("Vercel domain API not configured — skipping domain addition");
    return { success: false, error: "Vercel API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${teamQuery()}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: domain }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    return {
      success: false,
      error: data.error?.message || JSON.stringify(data),
    };
  }

  // After adding, fetch domain config to get required DNS records
  const configRes = await fetch(
    `${API_BASE}/v6/domains/${domain}/config${teamQuery()}`,
    { headers: headers() }
  );
  const config = configRes.ok ? await configRes.json() : null;

  // Fetch verification records
  const domainRes = await fetch(
    `${API_BASE}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`,
    { headers: headers() }
  );
  const domainData = domainRes.ok ? await domainRes.json() : null;

  return {
    success: true,
    verification: domainData?.verification || [],
    apexName: domainData?.apexName,
    cnames: config?.cnames || [],
  };
}

/**
 * Remove a custom domain from the Vercel project.
 */
export async function removeDomain(domain: string): Promise<{ success: boolean; error?: string }> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { success: false, error: "Vercel API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`,
    {
      method: "DELETE",
      headers: headers(),
    }
  );

  if (!res.ok) {
    const data = await res.json();
    return { success: false, error: data.error?.message || "Failed to remove domain" };
  }

  return { success: true };
}

/**
 * Check if a domain's DNS is configured correctly.
 * Uses both the project domain endpoint (ownership) and config endpoint (DNS).
 */
export async function verifyDomain(domain: string): Promise<{
  verified: boolean;
  configured: boolean;
  error?: string;
}> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { verified: false, configured: false, error: "Vercel API not configured" };
  }

  // Check ownership verification
  const domainRes = await fetch(
    `${API_BASE}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`,
    { headers: headers() }
  );

  if (!domainRes.ok) {
    return { verified: false, configured: false, error: "Domain not found on project" };
  }

  const domainData = await domainRes.json();

  // Check DNS configuration
  const configRes = await fetch(
    `${API_BASE}/v6/domains/${domain}/config${teamQuery()}`,
    { headers: headers() }
  );

  let configured = false;
  if (configRes.ok) {
    const configData = await configRes.json();
    configured = configData.misconfigured === false;
  }

  return {
    verified: domainData.verified === true,
    configured,
  };
}
