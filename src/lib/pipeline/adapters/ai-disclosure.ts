/**
 * AI content disclosure — platform compliance helpers.
 *
 * Per project_tracpost_ai_disclosure_as_asset.md, disclosure isn't a stigma —
 * it's an engagement asset in Phase-3 cultural normalization. Compliance is
 * the floor; deliberate transparency is positioning.
 *
 * Per #160, when an asset's media_assets.metadata.ai_generated=true, every
 * platform publish MUST flag the post as AI-generated. Where APIs support an
 * explicit flag, set it. Where they don't, prepend disclosure language to the
 * caption. Either way, the disclosure is visible, intentional, and documented.
 *
 * Pairs with:
 * - #161 (input correctness) — sets the ai_generated flag at upload
 * - #159 (publisher defaults) — explicit-parameter discipline
 * - project_tracpost_meta_relationship_posture.md — rigorous compliance posture
 */

/**
 * Disclosure prefix added to captions when API flag isn't available or to
 * supplement the API flag with visible text. Phase 3 framing —
 * transparency-as-feature, not warning label.
 *
 * Subscribers can override the prefix via per-site configuration later (#118
 * marketing copy includes guidance on customizing disclosure language).
 */
export const AI_DISCLOSURE_PREFIX = "🤖 Includes AI-generated visuals.";

/**
 * Apply AI disclosure to a caption. Returns the caption with disclosure
 * prepended when the asset is AI-generated; original caption otherwise.
 * Idempotent — won't double-prefix if disclosure already present.
 */
export function applyDisclosurePrefix(caption: string, aiGenerated: boolean): string {
  if (!aiGenerated) return caption;
  // Idempotency: don't double-prefix if disclosure language already there
  if (caption.includes("AI-generated") || caption.includes("🤖")) return caption;
  return `${AI_DISCLOSURE_PREFIX}\n\n${caption}`;
}

/**
 * Per-platform disclosure strategy.
 *
 * Lookup table for which platforms support an explicit API flag vs. which
 * need caption-prepend. Updated as platforms add/remove API support.
 *
 * Source notes (verify periodically):
 * - Meta IG/FB Graph API: limited explicit-flag support at publish layer.
 *   Meta auto-detects from asset signals (C2PA, watermarks). When subscriber
 *   declares AI, we caption-prepend AND set any documented flags Meta accepts.
 * - TikTok API: has `is_ai_generated` flag for content disclosure.
 * - YouTube API: has `containsSyntheticMedia` field on video uploads (newer).
 * - LinkedIn: limited; caption-prepend only.
 * - Pinterest: caption-prepend only (no API flag).
 * - X/Twitter: caption-prepend only.
 */
export const DISCLOSURE_STRATEGY: Record<
  string,
  { apiFlag: boolean; captionPrepend: boolean; flagFieldName?: string }
> = {
  instagram: { apiFlag: false, captionPrepend: true },
  facebook: { apiFlag: false, captionPrepend: true },
  tiktok: { apiFlag: true, captionPrepend: true, flagFieldName: "is_ai_generated" },
  youtube: { apiFlag: true, captionPrepend: false, flagFieldName: "containsSyntheticMedia" },
  linkedin: { apiFlag: false, captionPrepend: true },
  pinterest: { apiFlag: false, captionPrepend: true },
  twitter: { apiFlag: false, captionPrepend: true },
  gbp: { apiFlag: false, captionPrepend: true },
};

/**
 * Convenience: should this platform's adapter apply caption prepend?
 */
export function shouldPrependDisclosure(platform: string, aiGenerated: boolean): boolean {
  if (!aiGenerated) return false;
  return DISCLOSURE_STRATEGY[platform]?.captionPrepend ?? true;
}

/**
 * Convenience: does this platform support an explicit AI flag in its API?
 */
export function platformSupportsAiFlag(platform: string): boolean {
  return DISCLOSURE_STRATEGY[platform]?.apiFlag ?? false;
}
