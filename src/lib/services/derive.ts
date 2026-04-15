/**
 * Derive service rows from the brand playbook + the site's GBP
 * category assignment. Every service anchors to one or more gcids
 * (no ad-hoc services) — the service name is tenant-facing, the
 * gcid(s) carry SEO weight, schema.org types, and LLM keyword
 * constraints.
 *
 * Distribution targets 6–8 total services: the primary gcid seeds
 * 2–3 tier variants (when the playbook supports tiering); each
 * additional gcid seeds 1 baseline service. Lines up with the
 * 3-column reflow grid on the work page.
 *
 * Existing services are preserved unless force=true.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface DerivedService {
  name: string;
  description: string;
  priceRange?: string;
  duration?: string;
  /** gcid this service anchors to. Must appear in the site's categories. */
  gcid: string;
  /** true for the flagship variant per gcid; used to order tiles. */
  isPrimaryForGcid: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

interface CategoryAnchor {
  gcid: string;
  name: string;
  isPrimary: boolean;
}

async function loadCategoryAnchors(siteId: string): Promise<CategoryAnchor[]> {
  const rows = await sql`
    SELECT sgc.gcid, sgc.is_primary, gc.name
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId}
    ORDER BY sgc.is_primary DESC
  `;
  return rows.map((r) => ({
    gcid: String(r.gcid),
    name: String(r.name),
    isPrimary: Boolean(r.is_primary),
  }));
}

async function generateServices(
  playbook: BrandPlaybook,
  businessType: string | null,
  anchors: CategoryAnchor[],
): Promise<DerivedService[]> {
  const offerCore = playbook.offerCore;
  const offerStatement = offerCore?.offerStatement?.finalStatement || "";
  const benefits = offerCore?.benefits || [];
  const useCases = offerCore?.useCases || [];

  const primary = anchors.find((a) => a.isPrimary);
  const additional = anchors.filter((a) => !a.isPrimary);

  const anchorBlock = anchors
    .map((a) => `  ${a.isPrimary ? "[PRIMARY]" : "[ADDITIONAL]"} ${a.gcid} — ${a.name}`)
    .join("\n");

  const prompt = `You are defining the service tiles for a ${businessType || primary?.name || "local business"}'s website. Each tile anchors to one GBP category (gcid) — the anchor carries the SEO weight, the tile name + description is tenant-facing.

Tenant context:
Offer statement: ${offerStatement || "(not set)"}
Key benefits: ${benefits.join("; ") || "(none)"}
Use cases: ${useCases.join("; ") || "(none)"}

GBP category anchors (services MUST map to one of these gcids):
${anchorBlock}

Target 6–8 total services distributed as:
- Primary anchor (${primary?.name || "N/A"}): 2–3 tier variants — different price points, scopes, or customer types. One must be marked isPrimaryForGcid=true (the flagship). If the benefits list doesn't support tiering, 1 is fine.
- Each additional anchor: exactly 1 baseline service (isPrimaryForGcid=true).

A tier variant is something like:
  "Kitchen Refresh" (budget, cabinet reface + paint) vs
  "Signature Kitchen" (custom cabinetry + stone) vs
  "Whole-Home Kitchen" (structural + custom everything)

Do NOT invent categories. Use only the gcids listed above. Do NOT duplicate a variant across gcids. Names should sound like a real business's offerings — not taglines or benefit statements.

Reply with ONLY a JSON array:
[
  {
    "name": "Short service name (2-5 words)",
    "description": "One-sentence, second-person, present-tense description of what the customer gets.",
    "priceRange": "optional — e.g. '$8–15k' or 'From $200' or 'Custom quote', or omit",
    "duration": "optional — e.g. '2-3 weeks' or '1 hour' or omit",
    "gcid": "gcid:... (must match one of the anchors above)",
    "isPrimaryForGcid": true | false
  }
]`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("LLM returned no JSON array");
  const parsed = JSON.parse(match[0]) as DerivedService[];

  const validGcids = new Set(anchors.map((a) => a.gcid));
  return parsed.filter((s) => validGcids.has(s.gcid));
}

/**
 * Full derivation pipeline. Skips if the site already has services
 * unless force=true. Writes both services rows and their
 * service_gbp_categories bindings atomically per service.
 */
export async function deriveServicesForSite(
  siteId: string,
  opts: { force?: boolean } = {},
): Promise<{ created: number; skipped: boolean; reason?: string }> {
  const [site] = await sql`
    SELECT business_type, brand_playbook FROM sites WHERE id = ${siteId}
  `;
  if (!site?.brand_playbook) {
    return { created: 0, skipped: true, reason: "no playbook" };
  }

  const anchors = await loadCategoryAnchors(siteId);
  if (anchors.length === 0) {
    return { created: 0, skipped: true, reason: "no GBP categories — run categorizeForSite first" };
  }

  if (!opts.force) {
    const [existing] = await sql`SELECT COUNT(*)::int AS n FROM services WHERE site_id = ${siteId}`;
    if ((existing?.n as number) > 0) {
      return { created: 0, skipped: true, reason: "services already exist" };
    }
  } else {
    await sql`DELETE FROM services WHERE site_id = ${siteId} AND source = 'auto'`;
  }

  const services = await generateServices(
    site.brand_playbook as BrandPlaybook,
    (site.business_type as string) || null,
    anchors,
  );

  // Order: primary-anchor variants first (flagship on top), then
  // additional anchors in site_gbp_categories order.
  const anchorRank = new Map(anchors.map((a, i) => [a.gcid, a.isPrimary ? -1 : i]));
  services.sort((a, b) => {
    const rankDiff = (anchorRank.get(a.gcid) ?? 99) - (anchorRank.get(b.gcid) ?? 99);
    if (rankDiff !== 0) return rankDiff;
    // Within a gcid, flagship first
    return a.isPrimaryForGcid === b.isPrimaryForGcid ? 0 : a.isPrimaryForGcid ? -1 : 1;
  });

  let created = 0;
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const baseSlug = slugify(s.name);
    if (!baseSlug) continue;

    // Uniqueify slug if collision (e.g., two "Custom Kitchen" variants)
    let slug = baseSlug;
    let attempt = 1;
    while (true) {
      const [clash] = await sql`
        SELECT 1 FROM services WHERE site_id = ${siteId} AND slug = ${slug} LIMIT 1
      `;
      if (!clash) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
      if (attempt > 10) break;
    }

    const [row] = await sql`
      INSERT INTO services (site_id, name, slug, description, price_range, duration, display_order, source)
      VALUES (${siteId}, ${s.name}, ${slug}, ${s.description}, ${s.priceRange || null}, ${s.duration || null}, ${i}, 'auto')
      RETURNING id
    `;
    if (!row) continue;

    await sql`
      INSERT INTO service_gbp_categories (service_id, gcid, is_primary)
      VALUES (${row.id}, ${s.gcid}, ${s.isPrimaryForGcid})
      ON CONFLICT DO NOTHING
    `;
    created++;
  }

  return { created, skipped: false };
}
