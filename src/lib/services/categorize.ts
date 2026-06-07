/**
 * Curtained GBP category classification. Platform derives the tenant's
 * primary + additional categories from the brand playbook, business
 * type, and derived services. Tenant never picks from a 4000-category
 * dropdown — they see the result with per-category reasoning.
 *
 * Flow:
 *  1. Extract keyword signals from tenant state
 *  2. Rank gbp_categories by keyword match (names + synonyms)
 *  3. Top-N candidates → LLM rerank with reasoning
 *  4. Persist to site_gbp_categories
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";
import type { CategorizationResult, GbpCategory } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TenantSignals {
  businessType: string | null;
  location: string | null;
  offerStatement: string | null;
  offerBenefits: string[];
  tagline: string | null;
  services: Array<{ name: string; description: string | null }>;
}

async function gatherSignals(siteId: string): Promise<TenantSignals> {
  const [site] = await sql`
    SELECT business_type, location
    FROM businesses WHERE id = ${siteId}
  `;
  const playbook = await getBrandPlaybookFromDescriptor(siteId);
  const offerCore = playbook?.offerCore;
  const positioning = playbook?.brandPositioning;
  const tagline = positioning?.selectedAngles?.[0]?.tagline || null;

  const services = await sql`
    SELECT name, description FROM services WHERE business_id = ${siteId}
    ORDER BY display_order
  `;

  return {
    businessType: (site?.business_type as string) || null,
    location: (site?.location as string) || null,
    offerStatement: offerCore?.offerStatement?.finalStatement || null,
    offerBenefits: offerCore?.benefits || [],
    tagline,
    services: services.map((s) => ({
      name: String(s.name),
      description: s.description ? String(s.description) : null,
    })),
  };
}

function signalText(signals: TenantSignals): string {
  const parts: string[] = [];
  if (signals.businessType) parts.push(signals.businessType);
  if (signals.tagline) parts.push(signals.tagline);
  if (signals.offerStatement) parts.push(signals.offerStatement);
  parts.push(...signals.offerBenefits);
  parts.push(...signals.services.map((s) => `${s.name} ${s.description || ""}`));
  if (signals.location) parts.push(signals.location);
  return parts.join(" ").toLowerCase();
}

/**
 * Rank all gbp_categories by overlap between tenant signal text and
 * (name + keywords). Simple token-intersect scoring — fast, no
 * embeddings. Returns top N for LLM rerank.
 */
async function keywordRank(signalsText: string, limit = 40): Promise<Array<GbpCategory & { score: number }>> {
  const tokens = new Set(
    signalsText
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
  if (tokens.size === 0) return [];

  const rows = await sql`SELECT gcid, name, parent_gcid, keywords FROM gbp_categories`;

  const scored = rows.map((r) => {
    const name = String(r.name).toLowerCase();
    const keywords: string[] = (r.keywords as string[]) || [];
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += 2;
      for (const k of keywords) {
        if (k.toLowerCase() === t) score += 3;
        else if (k.toLowerCase().includes(t) || t.includes(k.toLowerCase())) score += 1;
      }
    }
    return {
      gcid: String(r.gcid),
      name: String(r.name),
      parentGcid: r.parent_gcid ? String(r.parent_gcid) : null,
      keywords,
      score,
    };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * LLM rerank: hand the top keyword matches to Claude with the
 * tenant's full signal set, ask for 1 primary + up to 4 additional
 * with short reasoning. Uses JSON mode to force a parseable reply.
 */
async function llmRerank(
  signals: TenantSignals,
  candidates: Array<GbpCategory & { score: number }>,
): Promise<CategorizationResult> {
  const candidateList = candidates
    .map((c) => `- ${c.gcid} — ${c.name} (keywords: ${c.keywords.join(", ")})`)
    .join("\n");

  const signalBlock = `
Business type: ${signals.businessType || "(unknown)"}
Location: ${signals.location || "(unknown)"}
Tagline: ${signals.tagline || "(none)"}
Offer statement: ${signals.offerStatement || "(none)"}
Benefits: ${signals.offerBenefits.join("; ") || "(none)"}
Services offered:
${signals.services.map((s) => `  - ${s.name}: ${s.description || ""}`).join("\n") || "  (none)"}
`.trim();

  const prompt = `You are classifying a local business for Google Business Profile (GBP). Pick the single BEST primary category and up to 4 additional categories from the candidate list below.

The primary category should match the business's core offering most narrowly. Additional categories should cover meaningful secondary service lines without diluting the primary. Do not add categories the business doesn't actually do.

Tenant profile:
${signalBlock}

Candidates:
${candidateList}

Reply with ONLY a JSON object in this exact shape:
{
  "primary": { "gcid": "gcid:...", "reasoning": "short sentence why this fits" },
  "additional": [
    { "gcid": "gcid:...", "reasoning": "short sentence why" }
  ]
}

Reasoning must be ONE sentence grounded in the tenant's actual profile. If a category doesn't clearly fit, omit it (0–4 additional is fine). Use exact gcid strings from the candidate list.`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM returned no JSON");

  const parsed = JSON.parse(jsonMatch[0]) as {
    primary: { gcid: string; reasoning: string };
    additional: Array<{ gcid: string; reasoning: string }>;
  };

  const byGcid = new Map(candidates.map((c) => [c.gcid, c]));

  const primaryCat = byGcid.get(parsed.primary.gcid);
  if (!primaryCat) throw new Error(`LLM picked unknown gcid: ${parsed.primary.gcid}`);

  const additional = (parsed.additional || [])
    .map((a) => {
      const cat = byGcid.get(a.gcid);
      if (!cat) return null;
      return {
        gcid: cat.gcid,
        name: cat.name,
        reasoning: a.reasoning,
        confidence: Math.min(0.95, 0.5 + cat.score / 20),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 4);

  return {
    primary: {
      gcid: primaryCat.gcid,
      name: primaryCat.name,
      reasoning: parsed.primary.reasoning,
      confidence: Math.min(0.95, 0.6 + primaryCat.score / 20),
    },
    additional,
  };
}

/**
 * Persist the categorization to site_gbp_categories. Replaces any
 * existing site bindings (full overwrite — the categorization pass
 * is the source of truth when called).
 */
export async function persistCategorization(
  siteId: string,
  result: CategorizationResult,
  chosenBy: "auto" | "admin" | "tenant" = "auto",
): Promise<void> {
  await sql`DELETE FROM business_gbp_categories WHERE business_id = ${siteId}`;

  await sql`
    INSERT INTO business_gbp_categories (business_id, gcid, is_primary, reasoning, confidence, chosen_by)
    VALUES (${siteId}, ${result.primary.gcid}, true, ${result.primary.reasoning}, ${result.primary.confidence}, ${chosenBy})
  `;

  for (const a of result.additional) {
    await sql`
      INSERT INTO business_gbp_categories (business_id, gcid, is_primary, reasoning, confidence, chosen_by)
      VALUES (${siteId}, ${a.gcid}, false, ${a.reasoning}, ${a.confidence}, ${chosenBy})
    `;
  }
}

/**
 * Full pipeline: gather signals → keyword rank → LLM rerank → persist.
 * Returns the result for logging / UI feedback. Safe to call multiple
 * times (persist is destructive-replace on the site).
 */
export async function categorizeForSite(siteId: string): Promise<CategorizationResult> {
  const signals = await gatherSignals(siteId);
  const candidates = await keywordRank(signalText(signals));
  if (candidates.length === 0) {
    throw new Error("No candidate categories matched — tenant signals are too sparse");
  }
  const result = await llmRerank(signals, candidates);
  await persistCategorization(siteId, result, "auto");
  return result;
}

/**
 * Read the current categorization for a site, joined with category
 * names. Returns null if no categorization has run yet.
 */
export async function loadSiteCategories(siteId: string): Promise<{
  primary: { gcid: string; name: string; reasoning: string | null; confidence: number | null };
  additional: Array<{ gcid: string; name: string; reasoning: string | null; confidence: number | null }>;
} | null> {
  const rows = await sql`
    SELECT sgc.gcid, sgc.is_primary, sgc.reasoning, sgc.confidence,
           gc.name
    FROM business_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${siteId}
    ORDER BY sgc.is_primary DESC, sgc.confidence DESC NULLS LAST
  `;

  if (rows.length === 0) return null;

  const primaryRow = rows.find((r) => r.is_primary);
  if (!primaryRow) return null;

  return {
    primary: {
      gcid: String(primaryRow.gcid),
      name: String(primaryRow.name),
      reasoning: primaryRow.reasoning ? String(primaryRow.reasoning) : null,
      confidence: primaryRow.confidence !== null ? Number(primaryRow.confidence) : null,
    },
    additional: rows
      .filter((r) => !r.is_primary)
      .map((r) => ({
        gcid: String(r.gcid),
        name: String(r.name),
        reasoning: r.reasoning ? String(r.reasoning) : null,
        confidence: r.confidence !== null ? Number(r.confidence) : null,
      })),
  };
}
