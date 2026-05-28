/**
 * Blog Theme Extraction — uses Claude Vision to scan a subscriber's
 * brand site and extract design tokens for blog styling.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

export interface BlogTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  headingFontFamily: string;
  borderRadius: string;
  logoUrl: string;
}

/**
 * Extract design tokens from a website URL using Claude Vision.
 * Fetches the page, sends a screenshot-equivalent to Claude, and
 * parses the returned design tokens.
 */
export async function extractBlogTheme(siteUrl: string): Promise<BlogTheme> {
  // Normalize URL
  const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url },
          },
          {
            type: "text",
            text: `Analyze this website and extract its design tokens. Return ONLY valid JSON (no markdown):
{
  "primaryColor": "<primary brand color as hex>",
  "secondaryColor": "<secondary color as hex>",
  "accentColor": "<accent/link color as hex>",
  "backgroundColor": "<page background color as hex>",
  "textColor": "<body text color as hex>",
  "fontFamily": "<body font family name>",
  "headingFontFamily": "<heading font family name>",
  "borderRadius": "<typical border radius, e.g. 8px>",
  "logoUrl": "<URL of the site logo if visible, or empty string>"
}

Be precise with hex colors. For fonts, return the family name (e.g., "Inter", "Open Sans", "system-ui"). If you can't determine a value, use a sensible default.`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned) as BlogTheme;
  } catch {
    // Return safe defaults if parsing fails
    return {
      primaryColor: "#1a1a1a",
      secondaryColor: "#4b5563",
      accentColor: "#3b82f6",
      backgroundColor: "#ffffff",
      textColor: "#1a1a1a",
      fontFamily: "system-ui, sans-serif",
      headingFontFamily: "system-ui, sans-serif",
      borderRadius: "8px",
      logoUrl: "",
    };
  }
}

/**
 * Scan and store theme for a site. Called on blog enable and by cron.
 */
export async function refreshSiteTheme(siteId: string): Promise<BlogTheme> {
  const [site] = await sql`
    SELECT url FROM businesses WHERE id = ${siteId}
  `;

  if (!site?.url) {
    throw new Error("Site URL not found");
  }

  const theme = await extractBlogTheme(site.url as string);

  await sql`
    UPDATE blog_settings
    SET theme = ${JSON.stringify(theme)}, updated_at = NOW()
    WHERE business_id = ${siteId}
  `;

  return theme;
}

/**
 * Refresh themes for all blog-enabled sites with stale themes (> 7 days).
 */
export async function refreshStaleThemes(): Promise<number> {
  const stale = await sql`
    SELECT business_id FROM blog_settings
    WHERE blog_enabled = true
      AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '7 days')
  `;

  let refreshed = 0;
  for (const row of stale) {
    try {
      await refreshSiteTheme(row.business_id as string);
      refreshed++;
    } catch (err) {
      console.error(`Theme refresh failed for site ${row.business_id}:`, err instanceof Error ? err.message : err);
    }
  }

  return refreshed;
}
