/**
 * Services derivation — cluster-driven.
 *
 * Per [[services-pipeline-doctrine]] (second-pass refinement 2026-06-16):
 * queries (via intent clusters) are the parent of both services and
 * categories. Each service derives from ONE intent cluster and gets
 * tagged with that cluster's id; the M:N junction binder then wires
 * service_gbp_categories rows by cluster_id intersection.
 *
 * The PRIOR design ("for each category, generate N variants") was
 * wrong — it collapsed M:N to 1:1, mistook Google's taxonomy for
 * what customers buy, and produced semantic near-duplicates. The
 * cluster-driven design produces fewer, more focused services that
 * match what customers actually search for, with M:N category
 * anchoring falling out deterministically.
 *
 * Inputs:
 *   - Intent clusters from intent-clustering.ts (REQUIRED — no clusters
 *     means no services; clustering must run upstream)
 *   - Brand playbook (offer, positioning, tagline) — for voice
 *   - Business type — for fallback when playbook is thin
 *   - (Future) Capacity constraints — to drop clusters the business
 *     can't deliver. v1 trusts clustering to surface plausible
 *     deliverables; capacity filter lands later.
 *
 * Output: 5-8 services, each tagged with source cluster_id in
 * metadata. Junction binding happens in a separate step.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";
import type { IntentCluster } from "@/lib/competitive-intel/intent-clustering";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

/**
 * A service derived from an intent cluster. cluster_id is the M:N
 * junction key — the binder uses it to wire service_gbp_categories.
 */
export interface DerivedService {
  /** Brand-voiced service name (2-5 words). */
  name: string;
  /** One-sentence, second-person, present-tense description. */
  description: string;
  /** Optional price-range hint ("$8-15k", "From $200", "Custom quote"). */
  priceRange?: string;
  /** Optional duration hint ("2-3 weeks", "1 hour"). */
  duration?: string;
  /** Source intent cluster — M:N junction key. */
  cluster_id: string;
  /** The cluster's intent_label — preserved for diagnostics. */
  cluster_intent_label: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const SYSTEM_PROMPT = `You are naming services for a local business's website.

Each service maps to ONE customer search-intent cluster — a group of queries customers actually use ("kitchen remodel", "kitchen renovation cost", etc.). Your job: produce ONE brand-voiced service name and description per cluster.

NAMING:
- 2-5 words. Brand-voiced. Customer-facing.
- Match the cluster's intent_label vocabulary (what customers searched), not Google's taxonomy ("Kitchen remodeler"), not operator jargon ("GC services").
- Tone follows the brand playbook — strong positioning, no weasel words, no hyperbole.

DESCRIPTION:
- One sentence, 15-30 words. Customer-facing tone.
- Evokes what the cluster's intent represents — if customers search "historic home renovation," speak to historic restoration specifically, not generic remodeling.
- VARY THE OPENING ACROSS SERVICES. Critical: do NOT start every description with the same word or phrase. A strip of cards all opening "You get..." or "We offer..." reads as templated AI copy and undersells the brand. Each description's first word should differ from the others.
- Lead with capability, craft, or method — not generic benefit-promise language. For premium / specialist brands the description should sound like brand-voice writing, not B2B SaaS marketing.
- Avoid weasel words ("comprehensive solutions", "tailored to your needs", "trusted partner") and hyperbole ("world-class", "unparalleled").

EXAMPLES of varied openings (different shape per service, same level of clarity):
- Capability-led: "Pittsburgh's most experienced design-build team for kitchens in pre-war homes — every layout, system, and finish coordinated under one roof."
- Method-led: "Period detail preserved, mechanical systems brought current — restoration handled by the same crew that designs it."
- Scope-led: "Whole-home renovation managed by architects who run the construction themselves, not subcontracted out."
- Condition-led: "When the existing space needs more than cosmetic refresh — structural reconfiguration, layout reimagining, full systems integration."
- Outcome-led: "Bathrooms that align with the home's architectural character — no incongruous remodel signatures."

Note: the LLM should INTERNALIZE the principle (varied openings + craft-led voice), not literally copy these examples. Each business gets its own voice rooted in its playbook.

PRICE / DURATION:
- Optional. Include ONLY when the brand playbook supports a clear claim. Vague hints ("Custom quote", "Contact for pricing") add no value — omit them.

BRAND NAME (when present in inputs):
- If a BRAND_NAME field is provided, use it EXACTLY as written when referencing the business in description text.
- If a BRAND_SHORT_FORM is provided, you may use it in informal/casual contexts but only when natural.
- NEVER invent variants. Do not combine the brand name with the service category to form compounds like "[Brand] Renovation" or "[Brand] Custom" — those are forbidden inventions. If you cannot use the brand name naturally in a sentence, OMIT the brand name from that sentence rather than invent.

CONSTRAINTS:
- One service per cluster. No tier variants (budget/mid/premium) unless explicitly justified by competitor evidence in the cluster — v1 doesn't support tier-variant generation, so produce exactly one service per cluster.
- Never invent activities the brand can't deliver. The cluster's intent already represents queries customers run; pair it with the brand's offer positioning.
- Don't restate the cluster's intent_label verbatim — that's the customer's query language, not the brand's service name.

OUTPUT a JSON array only. No prose, no markdown fences. Schema:
[
  {
    "cluster_id": "cluster_1",
    "name": "Brand-voiced 2-5 word service name",
    "description": "Single sentence, varied opening, craft-led voice. See EXAMPLES above for shape patterns — do not copy verbatim.",
    "priceRange": null,
    "duration": null
  },
  ...
]`;

function buildUserMessage(args: {
  clusters: IntentCluster[];
  playbook: BrandPlaybook | null;
  businessType: string | null;
  brandName: string | null;
  brandShortForm: string | null;
}): string {
  const { clusters, playbook, businessType, brandName, brandShortForm } = args;
  const offer = playbook?.offerCore;
  const positioning = playbook?.brandPositioning;
  const tagline = positioning?.selectedAngles?.[0]?.tagline || null;

  const lines: string[] = [];
  if (brandName) {
    lines.push(`BRAND_NAME: ${brandName}   ← use EXACTLY as written. Do NOT vary or invent compounds.`);
    if (brandShortForm) {
      lines.push(`BRAND_SHORT_FORM: ${brandShortForm}   ← permissible in casual contexts only.`);
    }
  }
  lines.push(`BUSINESS TYPE: ${businessType || "(not declared)"}`);
  lines.push(`TAGLINE: ${tagline || "(none)"}`);
  lines.push(
    `OFFER STATEMENT: ${offer?.offerStatement?.finalStatement || "(none)"}`,
  );
  if (offer?.benefits?.length) {
    lines.push(`KEY BENEFITS: ${offer.benefits.join("; ")}`);
  }
  if (offer?.useCases?.length) {
    lines.push(`USE CASES: ${offer.useCases.join("; ")}`);
  }
  if (positioning?.selectedAngles?.length) {
    const angles = positioning.selectedAngles
      .map((a) => a.name)
      .filter(Boolean)
      .join("; ");
    if (angles) lines.push(`POSITIONING ANGLES: ${angles}`);
  }

  lines.push("");
  lines.push(`INTENT CLUSTERS (one service per cluster):`);
  lines.push("");
  for (const c of clusters) {
    lines.push(`cluster_id: ${c.cluster_id}`);
    lines.push(`  intent_label: ${c.intent_label}`);
    lines.push(
      `  member_queries: ${c.member_queries.slice(0, 6).map((q) => `"${q}"`).join(", ")}`,
    );
    const topCategories = c.observed_category_frequencies
      .slice(0, 4)
      .map((f) => `${f.name} (${f.count})`)
      .join(", ");
    if (topCategories) {
      lines.push(`  ranking-competitor categories: ${topCategories}`);
    }
    lines.push("");
  }

  lines.push(
    `Produce ${clusters.length} services — exactly one per cluster. Return JSON only.`,
  );

  return lines.join("\n");
}

interface LlmService {
  cluster_id: string;
  name: string;
  description: string;
  priceRange?: string | null;
  duration?: string | null;
}

/**
 * Generate one brand-voiced service per intent cluster.
 * Pure function — no DB writes. Caller persists.
 */
export async function generateServicesFromClusters(args: {
  clusters: IntentCluster[];
  playbook: BrandPlaybook | null;
  businessType: string | null;
  /** Canonical public-facing marketing name. Per [[brand-naming-policy]]. */
  brandName: string | null;
  /** Declared abbreviation. Per [[brand-naming-policy]]. */
  brandShortForm: string | null;
}): Promise<DerivedService[]> {
  const { clusters } = args;
  if (clusters.length === 0) return [];

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(args) }],
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(
      `services-derive: model returned no JSON array (length=${text.length})`,
    );
  }

  let parsed: LlmService[];
  try {
    parsed = JSON.parse(match[0]) as LlmService[];
  } catch (parseErr) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(`services-derive: JSON.parse failed — ${parseMsg}`);
  }

  // Validate every output service points at a real cluster.
  const clusterById = new Map(clusters.map((c) => [c.cluster_id, c]));
  const result: DerivedService[] = [];
  for (const s of parsed) {
    const cluster = clusterById.get(s.cluster_id);
    if (!cluster) continue; // skip hallucinated cluster_ids
    if (!s.name?.trim() || !s.description?.trim()) continue;
    result.push({
      name: s.name.trim(),
      description: s.description.trim(),
      priceRange: s.priceRange?.trim() || undefined,
      duration: s.duration?.trim() || undefined,
      cluster_id: cluster.cluster_id,
      cluster_intent_label: cluster.intent_label,
    });
  }
  return result;
}

/**
 * Persist derived services to the services table. Existing 'auto'
 * services for this site are deleted first (full overwrite — the
 * pipeline run is the source of truth). Returns the inserted rows
 * with their generated ids so the caller can run the M:N junction
 * binder against them.
 *
 * cluster_id is stored in metadata JSONB for diagnostics + re-binding.
 */
export interface PersistedService extends DerivedService {
  id: string;
  slug: string;
  display_order: number;
}

export async function persistDerivedServices(
  siteId: string,
  services: DerivedService[],
): Promise<PersistedService[]> {
  // Full overwrite for 'auto' source — the pipeline is authoritative.
  await sql`DELETE FROM services WHERE business_id = ${siteId} AND source = 'auto'`;

  const persisted: PersistedService[] = [];
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const baseSlug = slugify(s.name);
    if (!baseSlug) continue;

    // Uniqueify slug if collision.
    let slug = baseSlug;
    let attempt = 1;
    while (true) {
      const [clash] = await sql`
        SELECT 1 FROM services WHERE business_id = ${siteId} AND slug = ${slug} LIMIT 1
      `;
      if (!clash) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
      if (attempt > 10) break;
    }

    const metadata = {
      cluster_id: s.cluster_id,
      cluster_intent_label: s.cluster_intent_label,
    };

    const [row] = await sql`
      INSERT INTO services (
        business_id, name, slug, description, price_range, duration,
        display_order, source, metadata
      )
      VALUES (
        ${siteId}, ${s.name}, ${slug}, ${s.description},
        ${s.priceRange || null}, ${s.duration || null},
        ${i}, 'auto', ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING id
    `;
    if (!row) continue;
    persisted.push({
      ...s,
      id: row.id as string,
      slug,
      display_order: i,
    });
  }
  return persisted;
}

/**
 * Convenience wrapper for site-level pipeline runs. Loads playbook
 * and business_type, generates services from clusters, persists them.
 * Caller still must run the M:N junction binder separately to wire
 * service_gbp_categories — that step requires coached categories
 * which this function doesn't produce.
 */
export async function deriveServicesForSite(args: {
  siteId: string;
  clusters: IntentCluster[];
}): Promise<{ created: number; persisted: PersistedService[]; skipped: boolean; reason?: string }> {
  const { siteId, clusters } = args;

  if (clusters.length === 0) {
    return { created: 0, persisted: [], skipped: true, reason: "no intent clusters — run clustering first" };
  }

  const [site] = await sql`
    SELECT business_type, brand_name, brand_short_form, name
    FROM businesses WHERE id = ${siteId}
  `;
  const playbook = await getBrandPlaybookFromDescriptor(siteId);

  const services = await generateServicesFromClusters({
    clusters,
    playbook,
    businessType: (site?.business_type as string) || null,
    brandName: (site?.brand_name as string) || (site?.name as string) || null,
    brandShortForm: (site?.brand_short_form as string) || null,
  });

  const persisted = await persistDerivedServices(siteId, services);
  return { created: persisted.length, persisted, skipped: false };
}
