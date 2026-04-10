/**
 * Derive blog theme tokens from a tenant's website.
 *
 * Fetches the site, extracts brand colors, fonts, and style cues
 * using a combination of CSS parsing and AI vision.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

interface DerivedTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  fontFamily: string;
  headingFontFamily: string;
  borderRadius: string;
}

/**
 * Analyze a website URL and derive visual brand tokens for the blog theme.
 * Uses Claude vision to analyze a screenshot-like description of the site.
 */
export async function deriveBlogTheme(
  siteId: string,
  websiteUrl: string
): Promise<DerivedTheme> {
  // Fetch the site's HTML to extract meta/CSS hints
  let cssHints = "";
  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": "TracPost-Bot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // Extract theme-color meta
    const themeColor = html.match(/<meta[^>]*name="theme-color"[^>]*content="([^"]+)"/i)?.[1];
    // Extract CSS custom properties from inline styles
    const rootVars = html.match(/:root\s*\{([^}]+)\}/)?.[1] || "";
    // Extract Google Font links
    const fontLinks = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"&]+)/g)]
      .map((m) => decodeURIComponent(m[1]).replace(/\+/g, " "))
      .slice(0, 3);

    cssHints = [
      themeColor ? `Theme color: ${themeColor}` : "",
      rootVars ? `CSS vars: ${rootVars.slice(0, 500)}` : "",
      fontLinks.length ? `Google Fonts: ${fontLinks.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    cssHints = "Could not fetch site CSS.";
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Analyze this website and derive a blog theme. Return design tokens that would make a blog feel like it belongs to this brand.

Website: ${websiteUrl}
${cssHints ? `\nCSS hints from the site:\n${cssHints}` : ""}

Return ONLY valid JSON (no markdown):
{
  "primaryColor": "<main heading/brand color, hex>",
  "accentColor": "<link/CTA color, hex>",
  "backgroundColor": "<page background, hex>",
  "textColor": "<body text color, hex>",
  "mutedColor": "<secondary/muted text, hex>",
  "borderColor": "<border/divider color, hex>",
  "fontFamily": "<body font CSS value — use the site's actual font if identified, or a similar one>",
  "headingFontFamily": "<heading font CSS value>",
  "borderRadius": "<border radius in px — 0px for sharp/industrial, 4-8px for modern, 12px+ for playful>"
}

Rules:
- If Google Fonts were detected, use those exact names
- If no fonts detected, choose fonts that match the industry/brand tone
- Prefer specific hex values over generic ones
- The theme should feel like it belongs to this brand, not a generic blog`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let theme: DerivedTheme;
  try {
    theme = JSON.parse(cleaned);
  } catch {
    // Fallback — clean defaults
    theme = {
      primaryColor: "#1a1a1a",
      accentColor: "#3b82f6",
      backgroundColor: "#ffffff",
      textColor: "#1a1a1a",
      mutedColor: "#6b7280",
      borderColor: "#e5e7eb",
      fontFamily: "system-ui, sans-serif",
      headingFontFamily: "system-ui, sans-serif",
      borderRadius: "6px",
    };
  }

  // Store in blog_settings
  await sql`
    UPDATE blog_settings
    SET theme = ${JSON.stringify(theme)}::jsonb, updated_at = NOW()
    WHERE site_id = ${siteId}
  `;

  return theme;
}
