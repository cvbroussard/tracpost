/**
 * One-off: run the aesthetic Phase 2 observation against an ARBITRARY external
 * site. Bypasses the businesses table — takes screenshot URL + brand name +
 * website URL as raw inputs. Doesn't write substrate (dumps observation JSON).
 *
 * Use case: validate observation prompt discipline on brands TracPost has no
 * data relationship with (no business_id, no R2 logo, no GBP). Tests whether
 * the v2 schema + prompt produce factual observation when given a single
 * screenshot of an unknown brand.
 *
 * Run: npx tsx --conditions=react-server scripts/run-aesthetic-observation-external.ts <screenshot_url> <brand_name> <website_url>
 *
 * Prompt is kept in sync with src/lib/brand-identity/aesthetic-observation.ts
 * by copy — this script intentionally has no production dependencies so it can
 * be run against any historical prompt version by editing it inline.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "brand_identity_observation_v2";

const anthropic = new Anthropic();

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizeMediaType(ct: string | null): AnthropicMediaType {
  const base = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (base === "image/jpeg" || base === "image/jpg") return "image/jpeg";
  if (base === "image/png") return "image/png";
  if (base === "image/gif") return "image/gif";
  if (base === "image/webp") return "image/webp";
  throw new Error(`unsupported image media type '${ct ?? "(none)"}'`);
}

async function fetchAsInlineImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status} for ${url}`);
  const media_type = normalizeMediaType(res.headers.get("content-type"));
  const bytes = Buffer.from(await res.arrayBuffer());
  return { media_type, data: bytes.toString("base64") };
}

function buildSystemPrompt(): string {
  return `You are a senior brand analyst on the first day of an engagement, studying a business from publicly available sources. Your single job is OBSERVATION — capture what is factually evident, exhaustively and without inference.

DISCIPLINE:
- Observe ONLY what is directly evidenced by the sources provided.
- Do NOT recommend, suggest, refine, or propose creative direction.
- Do NOT invent details to fill gaps — name gaps explicitly in gaps_and_absences.
- Do NOT generalize from category priors; report what THIS brand shows, not what brands like this typically show.
- Do NOT draw on training-memory of this brand if you happen to recognize it — observe ONLY from the provided image.
- Stay factual: "the website uses warm amber tones and large serif headings" rather than "the brand feels heritage-luxe".

PAYLOAD STRUCTURE: descriptor-keyed under domain. For each descriptor:
- If observable from sources: { "observed": <descriptor-specific value>, "evidence": [<direct quotes or specific visual elements>] }
- If not observable: null. DO NOT fabricate. visual.do_not_show is ALWAYS null (guardrails are not observable).
- evidence MUST be specific, quoted, or pointable. Every observed claim needs at least one evidence item.

meta.verdict: type_a (well-established, distinctive, consistent) | type_b (existing but inconsistent or generic) | type_c (existing but mismatched with offering) | type_d (insufficient observable presence).
meta.confidence: 0.0 to 1.0.

distinctive_elements_vs_category_defaults: what stands out vs typical brands in this category.
gaps_and_absences: what couldn't be observed OR is missing from the brand's public presence.

OUTPUT: single valid JSON object. No prose, no markdown fences.`;
}

function buildUserText(brandName: string, websiteUrl: string, imageLabels: string[]): string {
  const lines: string[] = [];
  lines.push("OBSERVATION TARGET");
  lines.push(`- Business name: ${brandName}`);
  lines.push(`- Website: ${websiteUrl}`);
  lines.push("");
  lines.push("IMAGES PROVIDED IN THIS CALL (in order)");
  imageLabels.forEach((label, i) => lines.push(`  ${i + 1}. ${label}`));
  lines.push("");
  lines.push("REQUIRED OUTPUT SCHEMA (descriptor-keyed — emit every slot; use null when not observable from these sources)");
  lines.push(`{
  "meta": {
    "research_sources_consulted": ["..."],
    "verdict": "type_a|type_b|type_c|type_d",
    "confidence": 0.0,
    "visual_consistency_score": "X/10 — reason",
    "distinctiveness_score": "X/10 — reason",
    "alignment_with_positioning_score": "X/10 — reason"
  },
  "verbal": {
    "tone": { "observed": ["adjective", "..."], "evidence": ["direct quote", "..."] } | null,
    "lexicon": { "observed": { "use": ["term that recurs", "..."], "avoid": ["term notably absent or rejected", "..."] }, "evidence": ["..."] } | null,
    "avoid": { "observed": ["pattern the brand visibly refuses", "..."], "evidence": ["..."] } | null,
    "pov_persona": { "observed": "1st-singular | 1st-plural | 3rd-person + speaker identity", "evidence": ["..."] } | null,
    "mechanical_style": { "observed": ["sentence-length pattern", "casing pattern", "emoji policy", "..."], "evidence": ["..."] } | null,
    "tagline": { "observed": "the actual tagline text if visible", "evidence": ["..."] } | null
  },
  "strategic": {
    "offer": { "observed": { "services": ["..."], "capabilities": ["..."] }, "evidence": ["..."] } | null,
    "positioning": { "observed": { "wedge": "1-sentence stance", "angles": ["distinct angle", "..."], "narrative": "what story the brand tells about itself" }, "evidence": ["..."] } | null,
    "audience": { "observed": ["who the copy addresses", "..."], "evidence": ["..."] } | null,
    "proof": { "observed": ["projects shown", "certs visible", "testimonials present", "..."], "evidence": ["..."] } | null,
    "hooks": { "observed": ["opening angle / story pattern used", "..."], "evidence": ["..."] } | null,
    "cta": { "observed": { "action": "what the brand asks for", "style": "warm | urgent | qualifier-filtered | ..." }, "evidence": ["..."] } | null
  },
  "visual": {
    "aesthetic": { "observed": { "typography": ["family or character description", "..."], "layout": ["pattern", "..."], "overall": "1-sentence overall look/feel" }, "evidence": ["..."] } | null,
    "environmental_look": { "observed": { "lighting": "warm | cool | natural | dramatic | ...", "materials": ["material/texture token", "..."], "mood": "lived-in | just-finished | mid-process | ..." }, "evidence": ["..."] } | null,
    "subject_style": { "observed": { "photographic_treatment": "professional | candid | documentary | ...", "subjects_shown": ["who/what appears", "..."], "framing": "posed | mid-action | environmental | ..." }, "evidence": ["..."] } | null,
    "palette": { "observed": { "colors": ["hex or named color", "..."], "usage": "how the colors are distributed" }, "evidence": ["..."] } | null,
    "logo": { "observed": { "mark": "description of the logo mark", "usage": "where it appears + consistency" }, "evidence": ["..."] } | null,
    "do_not_show": null
  },
  "sonic": {
    "voiceover_character": null,
    "music_mood": null,
    "sfx_style": null,
    "pronunciation": null
  },
  "distinctive_elements_vs_category_defaults": ["..."],
  "gaps_and_absences": ["..."]
}`);
  return lines.join("\n");
}

(async () => {
  const [screenshotUrl, brandName, websiteUrl] = process.argv.slice(2);
  if (!screenshotUrl || !brandName || !websiteUrl) {
    console.error("usage: npx tsx scripts/run-aesthetic-observation-external.ts <screenshot_url> <brand_name> <website_url>");
    process.exit(1);
  }

  console.log(`\nObservation target: ${brandName}`);
  console.log(`Website:            ${websiteUrl}`);
  console.log(`Screenshot:         ${screenshotUrl}\n`);

  console.log("Fetching screenshot…");
  const img = await fetchAsInlineImage(screenshotUrl);
  console.log(`  ${img.media_type}, ${Math.round(img.data.length * 0.75 / 1024)}KB raw\n`);

  console.log(`Calling ${MODEL} (${PROMPT_VERSION})…`);
  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
      { type: "text", text: buildUserText(brandName, websiteUrl, ["website homepage screenshot"]) },
    ]}],
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed}s\n`);

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let payload: unknown;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    console.error(`Non-JSON output (length=${text.length}). Raw text follows:\n`);
    console.error(text);
    process.exit(1);
  }

  console.log("=== OBSERVATION PAYLOAD ===");
  console.log(JSON.stringify(payload, null, 2));
  console.log("\n=== USAGE ===");
  console.log(JSON.stringify(response.usage, null, 2));
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
