/**
 * POST /api/auto-tag-suggest
 *
 * The auto-tag inspector backend. LOCKED 2026-05-10.
 * See memory/project_tracpost_auto_tag_inspector_design.md for the
 * full architecture.
 *
 * Single round-trip that produces, per asset recording commit:
 *
 *   1. story_angles  — pillar+tags via suggestTags() (separate layer,
 *      NOT part of the 6-group entity tagging)
 *   2. groups.{brand|service|project|persona|branch|service_area}
 *      with applied_matches (existing-catalog hits, server-side
 *      auto-linked) and suggested_new (NER new-entity proposals,
 *      brand-only per locked rules)
 *
 * Cross-group matches are ADDITIVE — same transcript may yield hits
 * across multiple groups, all surface, no suppression. Subscriber
 * confirms each independently in the modal inspector.
 *
 * Body: { transcript, site_id, source_asset_id?, business_category? }
 *
 * Returns:
 *   {
 *     story_angles: { pillarId, tagIds },
 *     groups: {
 *       brand:        { applied_matches: CatalogMatch[], suggested_new: NewCandidate[] },
 *       service:      { applied_matches: CatalogMatch[], suggested_new: [] },
 *       project:      { applied_matches: CatalogMatch[], suggested_new: [] },
 *       persona:      { applied_matches: CatalogMatch[], suggested_new: [] },
 *       branch:       { applied_matches: CatalogMatch[], suggested_new: [] },
 *       service_area: { applied_matches: CatalogMatch[], suggested_new: [] },
 *     },
 *     ner_provider: string,
 *     ner_warnings: string[],
 *     source_asset_id: string | null
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { suggestTags } from "@/lib/triage/suggest-tags";
import { extractEntities } from "@/lib/ner";
import {
  AUTO_TAG_RULES,
  findCatalogMatches,
  type TagGroup,
  type CatalogMatch,
} from "@/lib/auto-tag-rules";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

type NewCandidate = {
  name: string;
  slug: string;
  context: string;
};

type GroupResult = {
  applied_matches: CatalogMatch[];
  suggested_new: NewCandidate[];
};

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { transcript, site_id, source_asset_id, business_category } = body;

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "transcript required" }, { status: 400 });
    }
    if (!site_id) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
    }

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Fetch all 6 catalogs + run NER + suggestTags in parallel.
    // Catalogs: 6 small per-site queries. Promise.all collapses to one
    // network round-trip's latency.
    const [
      brandRows,
      serviceRows,
      projectRows,
      personaRows,
      branchRows,
      serviceAreaRows,
      tagSuggestion,
      ner,
    ] = await Promise.all([
      sql`SELECT id, name FROM brands WHERE site_id = ${site_id}`,
      sql`SELECT id, name FROM services WHERE site_id = ${site_id}`,
      sql`SELECT id, name FROM projects WHERE site_id = ${site_id}`,
      sql`SELECT id, name FROM personas WHERE site_id = ${site_id}`,
      sql`SELECT id, name FROM branches WHERE site_id = ${site_id}`,
      // Service areas: surface OVERLAY id (matches asset_service_areas FK)
      // with canonical name (the human-readable string subscribers see).
      sql`
        SELECT sa.id, c.name
        FROM site_service_areas sa
        JOIN service_areas_canonical c ON c.id = sa.service_area_canonical_id
        WHERE sa.site_id = ${site_id}
      `,
      suggestTags(site_id, transcript).catch(() => ({
        pillarId: "",
        tagIds: [] as string[],
      })),
      extractEntities(transcript, business_category).catch(() => ({
        brands: [] as Array<{ name: string; context: string }>,
        places: [] as Array<{ name: string; context: string }>,
        provider: "error",
        warnings: [] as string[],
      })),
    ]);

    // Per-group catalog scan using the locked rules module.
    const groupEntities: Record<TagGroup, Array<{ id: string; name: string }>> = {
      brand: brandRows.map((r) => ({ id: r.id as string, name: r.name as string })),
      service: serviceRows.map((r) => ({ id: r.id as string, name: r.name as string })),
      project: projectRows.map((r) => ({ id: r.id as string, name: r.name as string })),
      persona: personaRows.map((r) => ({ id: r.id as string, name: r.name as string })),
      branch: branchRows.map((r) => ({ id: r.id as string, name: r.name as string })),
      service_area: serviceAreaRows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
      })),
    };

    const groups: Record<TagGroup, GroupResult> = {
      brand: { applied_matches: [], suggested_new: [] },
      service: { applied_matches: [], suggested_new: [] },
      project: { applied_matches: [], suggested_new: [] },
      persona: { applied_matches: [], suggested_new: [] },
      branch: { applied_matches: [], suggested_new: [] },
      service_area: { applied_matches: [], suggested_new: [] },
    };

    for (const group of Object.keys(groups) as TagGroup[]) {
      groups[group].applied_matches = findCatalogMatches(
        transcript,
        group,
        groupEntities[group],
      );
    }

    // Brand new-entity suggestions from NER (only group with
    // suggest_create_new=true per AUTO_TAG_RULES).
    if (AUTO_TAG_RULES.brand.allow_suggest_create_new) {
      const matchedBrandIds = new Set(
        groups.brand.applied_matches.map((m) => m.entity_id),
      );
      const matchedBrandNamesLower = new Set(
        groups.brand.applied_matches.map((m) => m.name.toLowerCase()),
      );
      for (const b of ner.brands) {
        const slug = slugify(b.name);
        const lower = b.name.toLowerCase();
        // Skip if NER candidate matches an already-applied existing brand.
        // Catalog scan + name-substring check both ways for robustness.
        const overlaps = Array.from(matchedBrandNamesLower).some(
          (existing) => lower.includes(existing) || existing.includes(lower),
        );
        if (overlaps) continue;
        // Skip if slug already exists in catalog (defensive — usually
        // caught by overlaps check, but slug-based dedup is cheap).
        const existingBrand = brandRows.find(
          (r) => slugify(r.name as string) === slug,
        );
        if (existingBrand) {
          // It exists in catalog but didn't catalog-match (maybe due to
          // word-boundary or eligibility rules). Add to applied_matches
          // anyway — subscriber said the name, brand exists, link it.
          if (!matchedBrandIds.has(existingBrand.id as string)) {
            groups.brand.applied_matches.push({
              entity_id: existingBrand.id as string,
              name: existingBrand.name as string,
              match_text: b.name,
              match_start: -1,
              context_excerpt: b.context,
            });
            matchedBrandIds.add(existingBrand.id as string);
          }
          continue;
        }
        groups.brand.suggested_new.push({
          name: b.name,
          slug,
          context: b.context,
        });
      }
    }

    // AUTO-LINK existing matches to asset_*_join across all 6 groups.
    // Subscriber's authorization of entity existence + transcript mention
    // = implicit asset-link confirmation. Server inserts now; pre-checked
    // pills in modal; subscriber unchecks before save if any false hits.
    if (source_asset_id) {
      for (const group of Object.keys(groups) as TagGroup[]) {
        const rules = AUTO_TAG_RULES[group];
        if (!rules.allow_auto_link_existing) continue;
        for (const m of groups[group].applied_matches) {
          try {
            switch (group) {
              case "brand":
                await sql`INSERT INTO asset_brands (asset_id, brand_id) VALUES (${source_asset_id}, ${m.entity_id}) ON CONFLICT DO NOTHING`;
                break;
              case "service":
                await sql`INSERT INTO asset_services (asset_id, service_id) VALUES (${source_asset_id}, ${m.entity_id}) ON CONFLICT DO NOTHING`;
                break;
              case "project":
                await sql`INSERT INTO asset_projects (asset_id, project_id) VALUES (${source_asset_id}, ${m.entity_id}) ON CONFLICT DO NOTHING`;
                break;
              case "persona":
                await sql`INSERT INTO asset_personas (asset_id, persona_id) VALUES (${source_asset_id}, ${m.entity_id}) ON CONFLICT DO NOTHING`;
                break;
              case "branch":
                await sql`INSERT INTO asset_branches (asset_id, branch_id) VALUES (${source_asset_id}, ${m.entity_id}) ON CONFLICT DO NOTHING`;
                break;
              case "service_area":
                await sql`INSERT INTO asset_service_areas (asset_id, site_service_area_id) VALUES (${source_asset_id}, ${m.entity_id}) ON CONFLICT DO NOTHING`;
                break;
            }
          } catch (err) {
            console.warn(
              `Auto-link ${group} ${m.entity_id} to asset ${source_asset_id} failed:`,
              err,
            );
          }
        }
      }
    }

    return NextResponse.json({
      story_angles: tagSuggestion,
      groups,
      ner_provider: ner.provider,
      ner_warnings: ner.warnings || [],
      source_asset_id: source_asset_id || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("auto-tag-suggest error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
