/**
 * Per-service regeneration — granular display-layer refresh.
 *
 * Per [[stable-service-identity]]: each service row is a persistent
 * identity. Stable fields (id, slug, primary_gcid, associated_gcids,
 * hero_asset_id, display_order, source) lock at creation. Name +
 * description are renewable per-service.
 *
 * This function refreshes name + description for ONE service while
 * preserving everything else. The LLM call is scoped to a single
 * service and receives the OTHER services' opening words as context
 * for explicit variety enforcement — sharper than the bulk regen's
 * implicit "vary across the batch" instruction.
 *
 * Round-trip: ~5-8 seconds (single LLM call, no clustering, no
 * categorize, no junction binding).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

export interface RegeneratedService {
  id: string;
  name: string;
  description: string;
  priceRange: string | null;
  duration: string | null;
}

interface ExistingService {
  id: string;
  name: string;
  description: string | null;
  primary_gcid: string | null;
  cluster_intent_label: string;
}

interface OtherService {
  name: string;
  openingPhrase: string;
}

const SYSTEM_PROMPT = `You are refreshing the name and description for ONE service on a local business's website.

The service is part of a larger services strip — other services already exist on the site with their own openings. Your job: produce a fresh name and description for this single service, with an opening that is meaningfully different from the others.

NAMING:
- 2-5 words. Brand-voiced. Customer-facing.
- Match the cluster's intent vocabulary (what customers searched), not Google taxonomy ("Kitchen remodeler"), not operator jargon.
- Tone follows the brand playbook — strong positioning, no weasel words, no hyperbole.

DESCRIPTION:
- One sentence, 15-30 words. Customer-facing tone.
- Evokes the cluster's intent. If the cluster is "historic home renovation," speak to that specifically.
- VARY THE OPENING. The other services' openings will be listed; your opening word/phrase must differ. Critical.
- Lead with capability, craft, or method — not generic benefit-promise language.
- Avoid weasel words ("comprehensive solutions", "tailored to your needs", "trusted partner") and hyperbole ("world-class", "unparalleled").

EXAMPLES of varied opening shapes (different first word, same level of clarity):
- Capability-led: "Pittsburgh's most experienced design-build team for kitchens..."
- Method-led: "Period detail preserved, mechanical systems brought current..."
- Scope-led: "Whole-home renovation managed by architects who run construction..."
- Condition-led: "When the existing space needs more than cosmetic refresh..."
- Outcome-led: "Bathrooms that align with the home's architectural character..."

These show shape variety. Do NOT copy them verbatim.

PRICE / DURATION:
- Optional. Include ONLY when the brand playbook supports a clear claim. Vague hints ("Custom quote") add no value — omit them.

BRAND NAME (when present in inputs):
- If a BRAND_NAME field is provided, use it EXACTLY as written when referencing the business in description text.
- If a BRAND_SHORT_FORM is provided, you may use it in informal/casual contexts but only when natural.
- NEVER invent variants. Do not combine the brand name with the service category to form compounds like "[Brand] Renovation" or "[Brand] Custom" — those are forbidden inventions. If you cannot use the brand name naturally in a sentence, OMIT the brand name from that sentence rather than invent.

CONSTRAINTS:
- Don't restate the cluster's intent label verbatim — that's the customer's query language, not the brand's service name.
- Don't reuse the current name or description verbatim — produce something fresh.
- Don't start the description with any of the other services' opening words/phrases listed below.

OUTPUT a single JSON object only. No prose, no markdown fences.

Schema:
{
  "name": "Brand-voiced 2-5 word service name",
  "description": "Single sentence, varied opening (different from the listed openings), craft-led voice.",
  "priceRange": null,
  "duration": null
}`;

function buildUserMessage(args: {
  service: ExistingService;
  others: OtherService[];
  businessType: string | null;
  brandName: string | null;
  brandShortForm: string | null;
  playbookSummary: {
    tagline: string | null;
    offerStatement: string | null;
    benefits: string[];
    positioningAngles: string[];
  };
}): string {
  const lines: string[] = [];
  if (args.brandName) {
    lines.push(`BRAND_NAME: ${args.brandName}   ← use EXACTLY as written. Do NOT vary or invent compounds.`);
    if (args.brandShortForm) {
      lines.push(`BRAND_SHORT_FORM: ${args.brandShortForm}   ← permissible in casual contexts only.`);
    }
  }
  lines.push(`BUSINESS TYPE: ${args.businessType || "(not declared)"}`);
  lines.push(`TAGLINE: ${args.playbookSummary.tagline || "(none)"}`);
  lines.push(`OFFER STATEMENT: ${args.playbookSummary.offerStatement || "(none)"}`);
  if (args.playbookSummary.benefits.length > 0) {
    lines.push(`KEY BENEFITS: ${args.playbookSummary.benefits.join("; ")}`);
  }
  if (args.playbookSummary.positioningAngles.length > 0) {
    lines.push(`POSITIONING ANGLES: ${args.playbookSummary.positioningAngles.join("; ")}`);
  }

  lines.push("");
  lines.push(`THIS SERVICE (refresh its name and description):`);
  lines.push(`  cluster intent: "${args.service.cluster_intent_label}"`);
  lines.push(`  current name:        ${args.service.name}`);
  lines.push(`  current description: ${args.service.description ?? "(none)"}`);

  lines.push("");
  lines.push(`OTHER SERVICES ON THE SITE (your opening MUST differ from each of these):`);
  if (args.others.length === 0) {
    lines.push(`  (no other services — first service on the site)`);
  } else {
    for (const o of args.others) {
      lines.push(`  - "${o.name}" — opens with: "${o.openingPhrase}"`);
    }
  }

  lines.push("");
  lines.push(`Produce ONE refreshed service for the current cluster intent. Return JSON only.`);
  return lines.join("\n");
}

/**
 * Extract the opening "phrase" of a description for variety-enforcement
 * context. We pass the first 5-7 words to the LLM as the "opening" that
 * the new description must differ from.
 */
function openingPhraseOf(description: string | null): string {
  if (!description) return "";
  const words = description.trim().split(/\s+/).slice(0, 6);
  return words.join(" ");
}

/**
 * Regenerate name + description for one service. Stable fields preserved.
 */
export async function regenerateSingleService(args: {
  siteId: string;
  serviceId: string;
}): Promise<RegeneratedService> {
  const { siteId, serviceId } = args;

  // Load target service
  const [target] = await sql`
    SELECT id, name, description, primary_gcid, metadata
    FROM services
    WHERE id = ${serviceId} AND business_id = ${siteId}
    LIMIT 1
  `;
  if (!target) {
    throw new Error(`Service ${serviceId} not found for business ${siteId}`);
  }
  const targetMetadata = (target.metadata as { cluster_intent_label?: string } | null) ?? null;
  const clusterIntent = targetMetadata?.cluster_intent_label;
  if (!clusterIntent) {
    throw new Error(
      `Service ${serviceId} has no cluster_intent_label in metadata — was it auto-generated by the pipeline? Per-service regen requires that provenance.`,
    );
  }

  // Load OTHER services for variety enforcement
  const otherRows = await sql`
    SELECT name, description FROM services
    WHERE business_id = ${siteId} AND id != ${serviceId}
    ORDER BY display_order
  `;
  const others: OtherService[] = otherRows.map((r) => ({
    name: String(r.name),
    openingPhrase: openingPhraseOf(r.description ? String(r.description) : null),
  }));

  // Load site context — includes brand_name + brand_short_form per
  // [[brand-naming-policy]] so the LLM has the canonical name explicitly
  // instead of inventing variants.
  const [site] = await sql`
    SELECT business_type, brand_name, brand_short_form, name
    FROM businesses WHERE id = ${siteId} LIMIT 1
  `;
  const playbook = await getBrandPlaybookFromDescriptor(siteId);
  const positioning = playbook?.brandPositioning;
  const tagline = positioning?.selectedAngles?.[0]?.tagline ?? null;
  const positioningAngles = positioning?.selectedAngles
    ?.map((a) => a.name)
    .filter((s): s is string => Boolean(s)) ?? [];
  const offerCore = playbook?.offerCore;

  const userMsg = buildUserMessage({
    service: {
      id: String(target.id),
      name: String(target.name),
      description: target.description ? String(target.description) : null,
      primary_gcid: target.primary_gcid ? String(target.primary_gcid) : null,
      cluster_intent_label: clusterIntent,
    },
    others,
    businessType: site?.business_type ? String(site.business_type) : null,
    brandName: (site?.brand_name as string) || (site?.name as string) || null,
    brandShortForm: (site?.brand_short_form as string) || null,
    playbookSummary: {
      tagline,
      offerStatement: offerCore?.offerStatement?.finalStatement ?? null,
      benefits: offerCore?.benefits ?? [],
      positioningAngles,
    },
  });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`regenerate-single: model returned no JSON object (length=${text.length})`);
  }
  let parsed: {
    name?: string;
    description?: string;
    priceRange?: string | null;
    duration?: string | null;
  };
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(
      `regenerate-single: JSON.parse failed — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!parsed.name?.trim() || !parsed.description?.trim()) {
    throw new Error("regenerate-single: model omitted name or description");
  }

  const newName = parsed.name.trim();
  const newDescription = parsed.description.trim();
  const newPriceRange = parsed.priceRange?.trim() || null;
  const newDuration = parsed.duration?.trim() || null;

  // UPDATE only the renewable fields. Stable fields preserved.
  await sql`
    UPDATE services
    SET name = ${newName},
        description = ${newDescription},
        price_range = ${newPriceRange},
        duration = ${newDuration},
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ last_regen_at: new Date().toISOString() })}::jsonb
    WHERE id = ${serviceId}
  `;

  return {
    id: serviceId,
    name: newName,
    description: newDescription,
    priceRange: newPriceRange,
    duration: newDuration,
  };
}
