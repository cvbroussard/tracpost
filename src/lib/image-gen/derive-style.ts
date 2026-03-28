import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

interface ImageStyleConfig {
  style: string;
  variations: string[];
}

/**
 * AI-derive the site's image style and composition variations
 * based on industry, brand positioning, and target audience.
 *
 * Called once during playbook sharpening or provisioning.
 * Stored on the sites table for all future image generation.
 */
export async function deriveImageStyle(
  siteId: string,
  siteName: string,
  industry: string,
  brandAngle: string
): Promise<ImageStyleConfig> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Generate an image style configuration for a business blog.

Business: ${siteName}
Industry: ${industry}
Brand positioning: ${brandAngle}

Generate TWO things:

1. "style" — A photography style directive (2-3 sentences) that defines the base aesthetic for ALL editorial images. This is the constant visual identity.
Include: lighting type, color palette, camera style, staging approach, what to exclude.
Think of it as art direction for a catalog photographer.

Example for luxury kitchen remodeling:
"Professional product photography for a luxury furniture brand. Natural daylight, neutral warm palette, minimal staging. Shot on medium format camera. Shallow depth of field. Clean, editorial style similar to Restoration Hardware or Arhaus catalog. No text, no watermarks, no people."

2. "variations" — An array of 6 composition/framing modifiers that rotate across images. These define WHAT the camera frames, not how it shoots. Each should be 1 short sentence.
They should be appropriate for this specific industry.

Example for luxury kitchen remodeling:
[
  "Wide environmental shot — full room context, architectural framing",
  "Tight detail close-up — material texture, grain, finish, surface quality",
  "Process and craftsmanship — hands working with tools, mid-fabrication",
  "Single object vignette — one piece isolated against clean background",
  "Lifestyle context — the material or product in a styled, lived-in setting",
  "Raw material origin — the material before fabrication, in natural or workshop state"
]

Return ONLY JSON, no markdown:
{"style": "...", "variations": ["...", "...", "...", "...", "...", "..."]}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const result = JSON.parse(jsonMatch[0]);

    const config: ImageStyleConfig = {
      style: result.style || "",
      variations: Array.isArray(result.variations) ? result.variations.slice(0, 6) : [],
    };

    // Save to site
    await sql`
      UPDATE sites
      SET image_style = ${config.style},
          image_variations = ${JSON.stringify(config.variations)}::jsonb
      WHERE id = ${siteId}
    `;

    return config;
  } catch (err) {
    console.warn("Image style derivation failed:", err instanceof Error ? err.message : err);
    return { style: "", variations: [] };
  }
}
