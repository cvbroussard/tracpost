/**
 * brand_descriptor → BrandPlaybook translation helper.
 *
 * Phase B retirement per [[brand-dna-retirement]] (LOCKED 2026-06-07). The
 * single pre-build before the brand_dna tripwire-rename: a translation layer
 * that synthesizes a BrandPlaybook-shaped object from brand_descriptor.declared
 * values. Existing v2-generator + pipeline consumers keep their current shape
 * expectations; only the source switches from a stored brand_dna.playbook JSONB
 * blob to a synthesized object built from the catalog.
 *
 * Per [[brand-identity-layer-stack]] doctrine: brand_descriptor is canonical;
 * surfaces translate from it. This helper IS that translation for the
 * publishing-pipeline surface.
 *
 * Output discontinuity is expected and acceptable per [[phase1-scope-lock]]
 * pre-publish state — some BrandPlaybook fields (searchPhrases, certain
 * languageMap parts, contentHooks, etc.) have no catalog equivalent today and
 * are emitted as empty/default. Each gap is a discrete catalog work item; the
 * helper documents them inline as TODO references.
 */
import "server-only";
import { sql } from "@/lib/db";
import type {
  BrandPlaybook,
  AudienceResearch,
  BrandPositioning,
  ContentHooks,
  OfferCore,
} from "@/lib/brand-intelligence/types";

interface DescriptorRow {
  key: string;
  declared: unknown;
}

async function readDescriptors(siteId: string): Promise<Map<string, unknown>> {
  const rows = await sql`
    SELECT bd.key, bd.declared
    FROM brand_descriptor bd
    JOIN brand_identity bi ON bi.id = bd.brand_identity_id
    WHERE bi.business_id = ${siteId}
      AND bi.is_primary = true
      AND bd.declared IS NOT NULL
  ` as DescriptorRow[];
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.key, r.declared);
  return map;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((s): s is string => typeof s === "string" && s.trim().length > 0))
    : [];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ── Translators ─────────────────────────────────────────────────────────────

function translatePositioning(declared: unknown): BrandPositioning {
  const obj = asObject(declared);
  const anglesRaw = obj?.angles;
  const angles = asObject(anglesRaw)?.angles;
  const arr = Array.isArray(anglesRaw) ? anglesRaw : Array.isArray(angles) ? angles : [];

  return {
    selectedAngles: arr
      .map((a) => asObject(a))
      .filter((a): a is Record<string, unknown> => a !== null)
      .map((a) => {
        const wedge = asObject(a.wedge);
        const stance = asString(wedge?.what_we_do ?? a.wedge);
        return {
          name: asString(a.label ?? a.name),
          // TODO: catalog has no .tagline within positioning angles. The
          // brand-identity tagline descriptor is separate. Stitched in
          // below from the tagline descriptor when available.
          tagline: "",
          targetPain: asString(a.target_pain),
          targetDesire: asString(a.target_desire),
          tone: asString(a.tone),
          contentThemes: asStringArray(a.content_themes),
          // Non-standard but preserved for consumers that read wedge:
          ...(stance ? { wedge: stance } : {}),
        } as BrandPositioning["selectedAngles"][0];
      }),
  };
}

function translateAudience(declared: unknown): AudienceResearch {
  const obj = asObject(declared);
  // The 2026 brand-identity catalog stores audience as:
  //   { primary: string, pains: string[], triggers: string[], who: string, ... }
  // Translate to the legacy AudienceResearch shape; empty where no equivalent.
  return {
    transformationJourney: {
      currentState: asString(obj?.primary ?? obj?.who),
      desiredState: "",
    },
    urgencyGateway: {
      problem: "",
      whyUrgent: "",
      failedSolutions: [],
      aspirinSolution: "",
    },
    painPoints: [],
    languageMap: {
      painPhrases: asStringArray(obj?.pains),
      desirePhrases: asStringArray(obj?.triggers),
      // TODO: searchPhrases — no catalog equivalent. Phase B gap per
      // [[brand-dna-retirement]]. Likely becomes a substrate kind, OR
      // folds into competitive-intel pipeline.
      searchPhrases: [],
      // TODO: emotionalTriggers — no catalog equivalent today.
      emotionalTriggers: [],
    },
    congregationPoints: [],
    competitiveLandscape: {
      existingSolutions: [],
      marketGaps: [],
      positioningOpportunities: [],
    },
  };
}

function translateOffer(declared: unknown): OfferCore {
  const obj = asObject(declared);
  // 2026 brand-identity catalog: offer.declared has { benefits: string[],
  // example: string, recommendation: {...} } shape OR Strategic Rec output
  // with { coherence, reasoning, confidence, recommendation }.
  const recommendation = asObject(obj?.recommendation);
  const benefits = asStringArray(obj?.benefits ?? recommendation?.benefits);
  const example = asString(obj?.example ?? recommendation?.example);

  return {
    offerStatement: {
      finalStatement: example,
      // TODO: emotionalCore was a brand_dna-specific field; catalog has no
      // direct equivalent. Falls back to first benefit if present.
      emotionalCore: benefits[0] || "",
      universalMotivatorsUsed: [],
    },
    benefits,
    useCases: [],
    hiddenBenefits: [],
    programNameOptions: [],
  };
}

function translateContentHooks(_descriptorMap: Map<string, unknown>): ContentHooks {
  // TODO: contentHooks (loved/liked rated hooks) was a brand_dna-specific
  // wizard artifact. Catalog has no direct equivalent. The hook_bank table
  // continues to serve as a substrate-adjacent source of hooks; consumers
  // that need ContentHooks can query that table separately. Returning
  // empty here lets v2-generator's existing branches handle the empty case.
  return {
    lovedHooks: [],
    likedHooks: [],
    totalRated: 0,
    summary: { loved: 0, liked: 0, skipped: 0 },
  };
}

// ── Tagline stitch ──────────────────────────────────────────────────────────
// The brand-identity catalog has a dedicated `tagline` descriptor (separate
// from positioning angles). Stitch it onto the first selected angle so legacy
// consumers reading `playbook.brandPositioning.selectedAngles[0].tagline`
// keep working.

function stitchTagline(positioning: BrandPositioning, declared: unknown): BrandPositioning {
  if (positioning.selectedAngles.length === 0) return positioning;
  const obj = asObject(declared);
  // Catalog tagline shape: { selected_example: { selected_example_text, ... } }
  const sel = asObject(obj?.selected_example);
  const text = asString(sel?.selected_example_text);
  if (!text) return positioning;
  const out = { ...positioning };
  out.selectedAngles = [...out.selectedAngles];
  out.selectedAngles[0] = { ...out.selectedAngles[0], tagline: text };
  return out;
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Returns a BrandPlaybook synthesized from brand_descriptor.declared values.
 * Returns null if the business has no brand_identity row at all (cold-start
 * brand with nothing declared). Returns a sparse BrandPlaybook (empty fields)
 * if the brand has SOME catalog data but not all of it — consumers should
 * handle the empty-fields case as they would for any minimal-tier brand.
 */
export async function getBrandPlaybookFromDescriptor(
  siteId: string,
): Promise<BrandPlaybook | null> {
  const descriptors = await readDescriptors(siteId);
  if (descriptors.size === 0) return null;

  let positioning = translatePositioning(descriptors.get("positioning"));
  positioning = stitchTagline(positioning, descriptors.get("tagline"));

  const playbook: BrandPlaybook = {
    generatedAt: new Date(0).toISOString(), // catalog values don't carry a single generation timestamp
    version: "phase-b-from-descriptor-v1",
    audienceResearch: translateAudience(descriptors.get("audience")),
    brandPositioning: positioning,
    contentHooks: translateContentHooks(descriptors),
    offerCore: translateOffer(descriptors.get("offer")),
  };

  return playbook;
}

/**
 * Companion read for the brand_dna envelope shape. v2-generator consumers
 * often read `brand_dna` (the envelope) rather than `brand_dna.playbook`
 * directly. This returns the same envelope shape but synthesized: playbook
 * from descriptor, signals always null (no catalog equivalent for observed
 * voice-fingerprint signals — that data lives in
 * public_presence_observation substrate now per [[brand-identity-closed-loop]]).
 */
export interface SyntheticBrandDnaEnvelope {
  playbook: BrandPlaybook | null;
  signals: null;
  score: { score: number; tier: "minimal" } | null;
  generated_at: string;
  version: string;
}

export async function getSyntheticBrandDnaEnvelope(
  siteId: string,
): Promise<SyntheticBrandDnaEnvelope> {
  const playbook = await getBrandPlaybookFromDescriptor(siteId);
  return {
    playbook,
    signals: null,
    score: null,
    generated_at: new Date(0).toISOString(),
    version: "phase-b-from-descriptor-v1",
  };
}
