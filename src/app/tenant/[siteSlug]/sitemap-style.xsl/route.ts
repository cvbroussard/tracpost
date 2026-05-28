import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { resolveBlogSiteBySlug } from "@/lib/blog";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ siteSlug: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return new NextResponse("Not Found", { status: 404 });

  const [siteRow] = await sql`
    SELECT s.name, s.business_logo,
           bs.theme
    FROM businesses s
    LEFT JOIN blog_settings bs ON bs.business_id = s.id
    WHERE s.id = ${site.siteId}
  `;

  const siteName = (siteRow?.name as string) || "Site";
  const logoUrl = (siteRow?.business_logo as string) || "";
  const theme = (siteRow?.theme as Record<string, string>) || {};
  const accent = theme.accentColor || "#3b82f6";
  const bg = theme.backgroundColor || "#ffffff";
  const text = theme.textColor || "#1a1a1a";
  const muted = theme.mutedColor || "#6b7280";
  const border = theme.borderColor || "#e5e7eb";
  const font = theme.fontFamily || "system-ui, sans-serif";

  const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">

  <xsl:output method="html" indent="yes" encoding="UTF-8" />

  <xsl:template match="/">
    <html>
      <head>
        <title>Sitemap — ${siteName}</title>
        ${logoUrl ? `<link rel="icon" href="${logoUrl}" />` : ""}
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: ${font};
            background: ${bg};
            color: ${text};
            padding: 40px 20px;
            max-width: 900px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 32px;
            padding-bottom: 20px;
            border-bottom: 1px solid ${border};
          }
          .logo {
            width: 36px;
            height: 36px;
            border-radius: 6px;
            object-fit: contain;
          }
          h1 {
            font-size: 20px;
            font-weight: 600;
          }
          .subtitle {
            font-size: 13px;
            color: ${muted};
            margin-top: 2px;
          }
          .count {
            font-size: 12px;
            color: ${muted};
            margin-bottom: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            text-align: left;
            font-size: 11px;
            font-weight: 500;
            color: ${muted};
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 8px 12px;
            border-bottom: 1px solid ${border};
          }
          td {
            padding: 10px 12px;
            font-size: 13px;
            border-bottom: 1px solid ${border};
          }
          tr:last-child td { border-bottom: none; }
          tr:hover td { background: ${accent}08; }
          a {
            color: ${accent};
            text-decoration: none;
          }
          a:hover { text-decoration: underline; }
          .priority {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
          }
          .p-high { background: ${accent}15; color: ${accent}; }
          .p-med { background: #f59e0b15; color: #f59e0b; }
          .p-low { background: ${muted}15; color: ${muted}; }
          .date { color: ${muted}; font-size: 12px; }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid ${border};
            font-size: 11px;
            color: ${muted};
          }
          /* Sitemap index styles */
          .sitemap-link { font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" alt="" class="logo" />` : ""}
          <div>
            <h1>${siteName}</h1>
            <div class="subtitle">XML Sitemap</div>
          </div>
        </div>

        <xsl:choose>
          <!-- Sitemap Index -->
          <xsl:when test="sitemap:sitemapindex">
            <p class="count">
              <xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)" /> sitemaps
            </p>
            <table>
              <thead>
                <tr>
                  <th>Sitemap</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                  <tr>
                    <td>
                      <a href="{sitemap:loc}" class="sitemap-link">
                        <xsl:value-of select="sitemap:loc" />
                      </a>
                    </td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </xsl:when>

          <!-- URL Set -->
          <xsl:otherwise>
            <p class="count">
              <xsl:value-of select="count(sitemap:urlset/sitemap:url)" /> URLs
            </p>
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Priority</th>
                  <th>Last Modified</th>
                  <th>Frequency</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:urlset/sitemap:url">
                  <tr>
                    <td>
                      <a href="{sitemap:loc}">
                        <xsl:value-of select="sitemap:loc" />
                      </a>
                    </td>
                    <td>
                      <xsl:choose>
                        <xsl:when test="sitemap:priority &gt;= 0.8">
                          <span class="priority p-high"><xsl:value-of select="sitemap:priority" /></span>
                        </xsl:when>
                        <xsl:when test="sitemap:priority &gt;= 0.5">
                          <span class="priority p-med"><xsl:value-of select="sitemap:priority" /></span>
                        </xsl:when>
                        <xsl:otherwise>
                          <span class="priority p-low"><xsl:value-of select="sitemap:priority" /></span>
                        </xsl:otherwise>
                      </xsl:choose>
                    </td>
                    <td class="date">
                      <xsl:value-of select="substring(sitemap:lastmod, 1, 10)" />
                    </td>
                    <td class="date">
                      <xsl:value-of select="sitemap:changefreq" />
                    </td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </xsl:otherwise>
        </xsl:choose>

        <div class="footer">
          Generated by ${siteName} · Powered by TracPost
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

  return new NextResponse(xsl, {
    headers: {
      "Content-Type": "text/xsl",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
