/**
 * Body post-processing pipeline — URL repair, markdown fixing, and
 * 404 validation for generated article bodies.
 *
 * Ported from v1 (`src/lib/pipeline/blog-generator.ts` cleanup passes).
 * Composable so generators can apply only the steps they need:
 *
 *   const cleaned = await applyAllRepairs(body, validUrls);
 *
 * Or piecemeal:
 *
 *   body = repairCorruptedTracpostUrls(body, validUrls);
 *   body = fixMalformedMarkdown(body);
 *   body = await validateImages(body);
 */

/**
 * v2 articles use {{asset:UUID}} placeholders — those get resolved to
 * URLs at RENDER time, not in the body. So this function operates on
 * already-rendered bodies (e.g. preview HTML) OR legacy v1-style
 * bodies that contain raw URLs.
 *
 * For v2 generation flow specifically, only fixMalformedMarkdown is
 * relevant — the LLM may still occasionally produce broken markdown
 * around the placeholders.
 */

/**
 * Step 1: Replace mangled assets.tracpost.com URLs with their closest
 * valid match. The LLM occasionally truncates or mangles long R2 URLs.
 * Uses longest-common-prefix matching against a known-valid set.
 *
 * Only swap when the prefix match is strong enough (>40 chars) to
 * avoid replacing genuinely different URLs.
 */
export function repairCorruptedTracpostUrls(
  body: string,
  validUrls: string[],
): string {
  if (validUrls.length === 0) return body;
  return body.replace(
    /https:\/\/assets\.tracpost\.com\/[^\s")\]]+/g,
    (found) => {
      if (validUrls.includes(found)) return found;
      let best = found;
      let bestLen = 0;
      for (const valid of validUrls) {
        let common = 0;
        while (
          common < found.length &&
          common < valid.length &&
          found[common] === valid[common]
        ) common++;
        if (common > bestLen) { bestLen = common; best = valid; }
      }
      return bestLen > 40 ? best : found;
    },
  );
}

/**
 * Step 2: Fix common malformed-markdown patterns the LLM produces:
 *   - Broken image syntax: ![url) → ![editorial image](url)
 *   - Empty alt text: ![](url) is valid, but ![ ](url) → ![image](url)
 *   - Truncated link at end of body: [text without closing
 *   - Unclosed link: [text](url without )
 *   - Bare R2 URLs not in markdown → wrap as image
 */
export function fixMalformedMarkdown(body: string): string {
  let out = body;

  // Broken image syntax: ![url) → ![editorial image](url)
  out = out.replace(
    /!\[(https?:\/\/[^\]]+)\)/g,
    (_, url) => `![editorial image](${url})`,
  );

  // Empty alt with whitespace: ![ ](url) → ![image](url)
  out = out.replace(/!\[\s*\]\(/g, "![image](");

  // Truncated link at end of body
  out = out.replace(/\[[^\]]*$/, "");

  // Unclosed markdown link: [text](url without closing paren
  out = out.replace(/\[[^\]]*\]\([^)]*$/, "");

  // Bare R2 image URLs at line boundaries → wrap as image
  out = out.replace(
    /(?:^|\n)\s*(https:\/\/assets\.tracpost\.com\/[^\s")\]]+\.(?:jpg|jpeg|png|webp))\s*(?:\n|$)/gm,
    (_, url) => `\n\n![image](${url})\n\n`,
  );

  return out;
}

/**
 * Step 3: HEAD-check every assets.tracpost.com URL in the body. If any
 * return 404 (or fail to fetch), strip them and their markdown wrapper
 * so rendered articles never have broken images.
 *
 * 5-second timeout per URL. Errors treated as 404 (defensive).
 */
export async function validateImageUrls(body: string): Promise<string> {
  let out = body;
  const urls = body.match(/https:\/\/assets\.tracpost\.com\/[^\s")\]]+/g) || [];
  for (const url of urls) {
    let dead = false;
    try {
      const check = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      if (check.status === 404) dead = true;
    } catch {
      dead = true;
    }
    if (dead) {
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(
        new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, "g"),
        "",
      );
    }
  }
  return out;
}

/**
 * Run the full repair pipeline. URL repair → markdown fix → 404 strip.
 * Most v2 generators will use this in one call.
 */
export async function applyAllRepairs(
  body: string,
  validUrls: string[],
): Promise<string> {
  let out = repairCorruptedTracpostUrls(body, validUrls);
  out = fixMalformedMarkdown(out);
  out = await validateImageUrls(out);
  return out;
}
