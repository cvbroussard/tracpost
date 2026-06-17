/**
 * Coached category family grouping.
 *
 * Per [[stable-service-identity]] doctrine: associated_gcids[] should
 * capture the cluster's curated category breadth — categories a
 * customer searching this intent would consider equivalent or related.
 *
 * Pure token-overlap semantic matching (the binder's deterministic
 * primary-anchor logic) can't see semantic equivalence without shared
 * text. "Custom home builder" and "General contractor" have ZERO token
 * overlap but a customer searching for either would find both. This
 * module uses ONE LLM call per regen to group coached categories into
 * conceptual families based on shared customer search intent.
 *
 * The binder then uses family membership to populate associated_gcids[]:
 * primary anchor + other members of primary's family.
 *
 * Cost: ~$0.001 per regen (single Haiku call, small payload).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CoachedCategory } from "./category-coaching";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

export interface CategoryFamily {
  /** Human-readable label for the family (e.g., "Whole-home construction"). */
  family_label: string;
  /** gcids that belong to this family. */
  gcids: string[];
}

const SYSTEM_PROMPT = `You are organizing a local business's GBP categories into conceptual families.

Customers search for businesses by activity type. Multiple Google taxonomy categories often serve the same conceptual search intent — a customer searching for "kitchen remodeler" might find businesses tagged "Kitchen remodeler", "Remodeler", or "General contractor". These are SEMANTICALLY equivalent from the customer's perspective even if the Google labels differ.

Your job: group the coached categories into 3-5 families. Each family is a set of 2-4 categories that customers would consider equivalent or closely related when searching for that kind of work.

RULES:
- Each category belongs to EXACTLY ONE family (no overlap).
- Family size: 2-4 categories typically. Some categories may legitimately be alone in their own family if they serve a distinct search intent that no other category overlaps with.
- Use the BUSINESS CONTEXT to inform groupings — what counts as "related" depends on the brand's actual offering and audience.
- Family labels are operator-readable summaries (2-4 words). They don't show up to customers.

OUTPUT a JSON array of family objects. No prose, no markdown fences.

Schema:
[
  { "family_label": "Whole-home construction", "gcids": ["gcid:general_contractor", "gcid:custom_home_builder", "gcid:construction_company"] },
  { "family_label": "Room renovation", "gcids": ["gcid:kitchen_remodeler", "gcid:bathroom_remodeler", "gcid:remodeler"] },
  ...
]`;

export async function computeCategoryFamilies(args: {
  coachedCategories: CoachedCategory[];
  businessType: string | null;
  offerStatement: string | null;
}): Promise<CategoryFamily[]> {
  const { coachedCategories, businessType, offerStatement } = args;
  if (coachedCategories.length < 2) {
    return coachedCategories.map((c) => ({
      family_label: c.name,
      gcids: [c.gcid],
    }));
  }

  const lines: string[] = [];
  lines.push(`BUSINESS CONTEXT:`);
  lines.push(`  Business type: ${businessType || "(not declared)"}`);
  lines.push(`  Offer: ${offerStatement || "(not declared)"}`);
  lines.push("");
  lines.push(`COACHED CATEGORIES TO GROUP (${coachedCategories.length}):`);
  for (const c of coachedCategories) {
    lines.push(`  - ${c.gcid}  →  ${c.name}`);
  }
  lines.push("");
  lines.push(`Group into 3-5 families. Each category in exactly one family. Return JSON only.`);

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`category-families: model returned no JSON array (length=${text.length})`);
  }

  let parsed: CategoryFamily[];
  try {
    parsed = JSON.parse(match[0]) as CategoryFamily[];
  } catch (e) {
    throw new Error(
      `category-families: JSON.parse failed — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Validate: every coached gcid must be assigned to exactly one family.
  const coachedSet = new Set(coachedCategories.map((c) => c.gcid));
  const assigned = new Set<string>();
  const validFamilies: CategoryFamily[] = [];
  for (const fam of parsed) {
    if (!fam.family_label?.trim() || !Array.isArray(fam.gcids)) continue;
    const valid_gcids = fam.gcids.filter((g) => coachedSet.has(g) && !assigned.has(g));
    if (valid_gcids.length === 0) continue;
    for (const g of valid_gcids) assigned.add(g);
    validFamilies.push({ family_label: fam.family_label.trim(), gcids: valid_gcids });
  }

  // Singleton-family fallback for any gcids the LLM forgot.
  for (const c of coachedCategories) {
    if (!assigned.has(c.gcid)) {
      validFamilies.push({ family_label: c.name, gcids: [c.gcid] });
      assigned.add(c.gcid);
    }
  }

  return validFamilies;
}

/**
 * Build a lookup: for each coached gcid, which other coached gcids
 * are in the same family. Used by the binder to populate associated_gcids[].
 */
export function buildFamilyLookup(
  families: CategoryFamily[],
): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const fam of families) {
    for (const gcid of fam.gcids) {
      lookup.set(
        gcid,
        fam.gcids.filter((g) => g !== gcid),
      );
    }
  }
  return lookup;
}
