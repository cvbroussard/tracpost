import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { SCENE_TYPES, isValidSceneTypeId } from "@/lib/scene-types";

const anthropic = new Anthropic();

interface SuggestedTags {
  pillarId: string;
  tagIds: string[];
  /** Scene composition IDs detected from transcript + image. Closed enum
   * per SCENE_TYPES catalog. Multi-select (asset can be multiple scene
   * types simultaneously — e.g., "after" + "wide_shot"). */
  sceneTypes: string[];
}

/**
 * AI-suggest content tags from a context note + optional image.
 * Reads the site's pillar_config and returns 3-5 matching tags.
 * Fast Haiku call — designed for real-time use during upload.
 *
 * When imageUrl is provided, Haiku sees BOTH the transcript and the
 * image. This is the right architecture for Story Angle (editorial
 * framing) — vision genuinely informs which pillar fits because the
 * picture IS the story. (Vision was correctly rejected for brand
 * detection where varietal precision isn't a vision strength; story
 * framing is the opposite case.)
 */
export async function suggestTags(
  siteId: string,
  contextNote: string,
  imageUrl?: string,
): Promise<SuggestedTags> {
  if (!contextNote || contextNote.length < 5) {
    return { pillarId: "", tagIds: [], sceneTypes: [] };
  }

  // Fetch pillar config
  const [site] = await sql`
    SELECT pillar_config FROM businesses WHERE id = ${siteId}
  `;

  const config = (site?.pillar_config || []) as Array<{
    id: string;
    framework: string;
    label: string;
    description: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  if (config.length === 0) {
    return { pillarId: "", tagIds: [], sceneTypes: [] };
  }

  // Build compact tag list for the prompt
  const tagMap = config.map((p) => ({
    pillar: p.id,
    pillarLabel: p.label,
    description: p.description,
    tags: p.tags.map((t) => `${t.id}: ${t.label}`).join(", "),
  }));

  // Scene composition options — closed enum, asset can be multiple
  // (e.g., a finished room shot is BOTH "after" AND "wide_shot").
  const sceneOptions = SCENE_TYPES.map(
    (s) => `${s.id}: ${s.label} — ${s.description}`,
  ).join("\n  ");

  const promptText = `Two analyses on the same content:

ANALYSIS 1 — STORY ANGLE TAGS (editorial framing, what the asset SAYS)
Pick the 3-5 most distinguishing tags for this content. Focus on what makes it specific — not everything it touches.

ANALYSIS 2 — SCENE COMPOSITION (what the asset literally SHOWS)
Pick 1-3 scene composition IDs that describe what's actually depicted. Multi-select OK (assets can legitimately be multiple — e.g., "after" + "wide_shot"). Use both transcript AND image signals.

${imageUrl ? "You're shown an image AND a context note. Use BOTH signals — the visual content reveals what the asset depicts; the text reveals subscriber's intent and the moment-of-capture context.\n\n" : ""}Context note: "${contextNote}"

Pillars and tags (for ANALYSIS 1):
${tagMap.map((p) => `[${p.pillar}] ${p.pillarLabel}: ${p.description}\n  Tags: ${p.tags}`).join("\n\n")}

Scene composition options (for ANALYSIS 2):
  ${sceneOptions}

Rules for tags:
- Pick the PRIMARY pillar (the one that best fits the overall content)
- Select 3-5 tags from ANY pillar that best distinguish this content from other content
- Match on substantive nouns (materials, brands, techniques, equipment) — ignore filler words and adjectives
- Prefer specific tags (a named vendor, a specific material) over broad ones (style, philosophy)

Rules for scene composition:
- Use linguistic tells in the transcript: "final / finished / completed result" → "after"; "before we started / pre-existing / starting state" → "before"; "during / mid-construction / framing in progress" → "in_progress"; "view of the entire / looking at the whole / full" → "wide_shot"; "close-up / detail of / you can see the" → "close_up"; "kids enjoying / family using / dinner / lifestyle" → "lifestyle"; "client / homeowner / our crew / foreman" with explicit person reference → "people"; "plans / diagram / sketch / screenshot" → "documentation"
- ALSO use vision signals when image is provided (silhouettes, framing, completion state)
- Return [] if you have no high-confidence reading — false positives are worse than misses for this layer

Return ONLY JSON, no markdown: {"pillar":"pillar_id","tags":["tag_id_1","tag_id_2"],"scene_types":["scene_id_1","scene_id_2"]}`;

  // Build content blocks: image first if present (Anthropic recommends
  // image-before-text ordering for best multimodal attention), then text.
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "url"; url: string } }
  > = [];
  if (imageUrl) {
    content.push({ type: "image", source: { type: "url", url: imageUrl } });
  }
  content.push({ type: "text", text: promptText });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const result = JSON.parse(cleaned);
    const rawScenes = Array.isArray(result.scene_types) ? result.scene_types : [];
    // Filter to closed enum — silently drop hallucinated scene IDs
    // (model occasionally invents new IDs; only valid catalog entries
    // should ever reach the asset).
    const sceneTypes = rawScenes.filter((id: unknown): id is string =>
      typeof id === "string" && isValidSceneTypeId(id),
    );
    return {
      pillarId: result.pillar || "",
      tagIds: Array.isArray(result.tags) ? result.tags : [],
      sceneTypes,
    };
  } catch {
    return { pillarId: "", tagIds: [], sceneTypes: [] };
  }
}
