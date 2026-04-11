import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const VERCEL_API = "https://api.vercel.com";

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

/**
 * POST /api/admin/website
 *
 * Actions:
 * - { action: "generate", site_id } — generate + deploy website
 * - { action: "add-domain", site_id, domain } — add root domain to website project
 * - { action: "verify-domain", site_id, domain } — check domain status
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { site_id, action } = body;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  if (action === "generate") {
    try {
      const { spinWebsite } = await import("@/lib/website-spinner/generate");
      const result = await spinWebsite(site_id);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }, { status: 500 });
    }
  }

  if (action === "add-domain") {
    const { domain } = body;
    if (!domain) {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }

    // Derive project name from site slug
    const [settings] = await sql`SELECT subdomain FROM blog_settings WHERE site_id = ${site_id}`;
    const siteSlug = (settings?.subdomain as string) || "";
    const projectName = `${siteSlug}-site`;

    // Add domain to the website project
    const addRes = await fetch(`${VERCEL_API}/v10/projects/${projectName}/domains${teamQuery()}`, {
      method: "POST",
      headers: vercelHeaders(),
      body: JSON.stringify({ name: domain }),
    });
    const addData = await addRes.json();

    if (!addRes.ok && addData.error?.code !== "domain_already_in_use") {
      return NextResponse.json({
        success: false,
        error: addData.error?.message || "Failed to add domain",
      });
    }

    // Fetch verification records
    const domainRes = await fetch(
      `${VERCEL_API}/v9/projects/${projectName}/domains/${domain}${teamQuery()}`,
      { headers: vercelHeaders() }
    );
    const domainData = domainRes.ok ? await domainRes.json() : null;

    // Build DNS records
    const dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }> = [];

    // Verification TXT
    if (domainData?.verification) {
      for (const v of domainData.verification) {
        dnsRecords.push({
          type: (v.type as string).toUpperCase(),
          name: v.domain as string,
          value: v.value as string,
          purpose: "Domain ownership verification",
        });
      }
    }

    // A record for root domain
    dnsRecords.push({
      type: "A",
      name: "@",
      value: "76.76.21.21",
      purpose: "Root domain to Vercel",
    });

    return NextResponse.json({
      success: true,
      domain,
      projectName,
      verified: domainData?.verified === true,
      dnsRecords,
    });
  }

  if (action === "verify-domain") {
    const { domain } = body;
    if (!domain) {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }

    const [settings] = await sql`SELECT subdomain FROM blog_settings WHERE site_id = ${site_id}`;
    const siteSlug = (settings?.subdomain as string) || "";
    const projectName = `${siteSlug}-site`;

    // Check domain status
    const domainRes = await fetch(
      `${VERCEL_API}/v9/projects/${projectName}/domains/${domain}${teamQuery()}`,
      { headers: vercelHeaders() }
    );

    if (!domainRes.ok) {
      return NextResponse.json({ verified: false, configured: false, error: "Domain not found" });
    }

    const domainData = await domainRes.json();

    // Check config
    const configRes = await fetch(
      `${VERCEL_API}/v6/domains/${domain}/config${teamQuery()}`,
      { headers: vercelHeaders() }
    );
    const configData = configRes.ok ? await configRes.json() : null;

    // Build DNS records
    const dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }> = [];

    // Pending verification TXT records
    if (domainData.verification) {
      for (const v of domainData.verification) {
        dnsRecords.push({
          type: (v.type as string).toUpperCase(),
          name: v.domain as string,
          value: v.value as string,
          purpose: "Domain ownership verification",
        });
      }
    }

    // A record for root domain
    dnsRecords.push({
      type: "A",
      name: "@",
      value: "76.76.21.21",
      purpose: "Root domain to Vercel",
    });

    return NextResponse.json({
      domain,
      verified: domainData.verified === true,
      configured: configData?.misconfigured === false,
      dnsRecords,
    });
  }

  if (action === "send-dns") {
    const { domain, dnsRecords } = body;
    if (!domain || !dnsRecords || !Array.isArray(dnsRecords)) {
      return NextResponse.json({ error: "domain and dnsRecords required" }, { status: 400 });
    }

    const [owner] = await sql`
      SELECT u.email, u.name
      FROM users u
      JOIN subscriptions sub ON sub.id = u.subscription_id
      JOIN sites s ON s.subscription_id = sub.id
      WHERE s.id = ${site_id} AND u.role = 'owner'
    `;
    if (!owner?.email) {
      return NextResponse.json({ error: "Tenant owner email not found" }, { status: 404 });
    }

    const [siteRow] = await sql`SELECT name FROM sites WHERE id = ${site_id}`;
    const siteName = (siteRow?.name as string) || "Your site";

    const { sendEmail } = await import("@/lib/email");

    const rows = dnsRecords.map((r: { type: string; name: string; value: string }) =>
      `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px;">${r.type}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px;">${r.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px; word-break: break-all;">${r.value}</td>
      </tr>`
    ).join("");

    const sent = await sendEmail({
      to: owner.email as string,
      subject: `${siteName} — Connect your website domain`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #1a1a1a;">
            Your website is ready
          </h1>
          <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
            Hi ${(owner.name as string) || "there"}, to connect your website to ${domain},
            add these DNS records with your domain provider:
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #e5e7eb;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Type</th>
                <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Name</th>
                <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Value</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
            <p style="margin: 0 0 8px;">If you use Cloudflare, set records to <strong>DNS only</strong> (grey cloud, not proxied).</p>
            <p style="margin: 0;">Not sure how? Forward this email to whoever manages your domain.</p>
          </div>
          <p style="font-size: 12px; color: #9ca3af;">
            — The ${siteName} content team, powered by TracPost
          </p>
        </div>
      `,
    });

    return NextResponse.json({ sent, to: owner.email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
