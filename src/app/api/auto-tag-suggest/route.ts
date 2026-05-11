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
  findKeywordCues,
  getEffectiveRules,
  type TagGroup,
  type CatalogMatch,
  type AutoTagRulesOverride,
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
  /** "ner" | "keyword" — surfaces in inspector pill as tooltip hint. */
  source?: string;
  /** Keyword that triggered creation (when source="keyword"). */
  keyword?: string;
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

    // Verify ownership + load per-site keyword cue overrides
    const [site] = await sql`
      SELECT id, tag_group_config FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const tagGroupConfig = (site.tag_group_config || {}) as Partial<Record<TagGroup, { keyword_cues?: string[]; rules?: AutoTagRulesOverride }>>;
    function rulesFor(group: TagGroup) {
      return getEffectiveRules(group, tagGroupConfig[group]?.rules);
    }

    // Resolve the asset's image URL for the multimodal Story Angle call.
    // Images: use storage_url directly. Videos: prefer the poster image
    // (referenced via poster_asset_id) since Anthropic Messages API
    // doesn't accept video files. Skip if no asset_id or no usable URL.
    //
    // FALLBACK for legacy videos: when video has no poster_asset_id (was
    // uploaded before poster_gen, or async gen failed silently), generate
    // the poster INLINE here. One-time cost per legacy video — the poster
    // persists on the asset row, future calls use it directly.
    let assetImageUrl: string | undefined;
    if (source_asset_id) {
      const [assetRow] = await sql`
        SELECT
          ma.storage_url,
          ma.media_type,
          ma.poster_asset_id,
          poster.storage_url AS poster_url
        FROM media_assets ma
        LEFT JOIN media_assets poster ON poster.id = ma.poster_asset_id
        WHERE ma.id = ${source_asset_id}
      `;
      if (assetRow) {
        const mediaType = (assetRow.media_type as string | null) || "";
        if (mediaType.startsWith("image/")) {
          assetImageUrl = assetRow.storage_url as string | undefined;
        } else if (mediaType.startsWith("video/")) {
          if (assetRow.poster_url) {
            assetImageUrl = assetRow.poster_url as string;
          } else {
            // Legacy video, no poster — generate now (best-effort,
            // bounded by serverless function timeout). Poster lives
            // on the asset row after, so future calls hit the cache.
            try {
              const { generatePosterForAsset } = await import(
                "@/lib/pipeline/poster-gen"
              );
              const posterId = await generatePosterForAsset(source_asset_id);
              if (posterId) {
                const [poster] = await sql`
                  SELECT storage_url FROM media_assets WHERE id = ${posterId}
                `;
                if (poster?.storage_url) {
                  assetImageUrl = poster.storage_url as string;
                }
              }
            } catch (err) {
              // Non-fatal: Story Angle falls back to text-only for this
              // call. Subscriber can retry, or upload a fresh video that
              // will get a poster the normal way.
              console.warn(
                "Inline poster generation for legacy video failed:",
                err instanceof Error ? err.message : err,
              );
            }
          }
        }
      }
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
      // Story Angle: multimodal Haiku call when we have an image URL.
      // Image-aware Story Angle is correct for editorial framing — vision
      // genuinely informs which pillar fits because the picture IS the
      // story. (Different from brand detection, where varietal precision
      // isn't a vision strength — kept text-only there.)
      suggestTags(site_id, transcript, assetImageUrl).catch(() => ({
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
        tagGroupConfig[group]?.rules,
      );
    }

    // STEP 3: Keyword cue scan — proposes new entities for ANY group
    // where the subscriber explicitly used a cue word ('project',
    // 'service', 'branch', etc.) near a capitalized name. Cheap
    // deterministic parsing, no LLM call. Closes the new-entity gap
    // for non-brand groups. See keyword_cue_creation memory.
    for (const group of Object.keys(groups) as TagGroup[]) {
      const overrideCues = tagGroupConfig[group]?.keyword_cues;
      const overrideRules = tagGroupConfig[group]?.rules;
      const cues = findKeywordCues(transcript, group, overrideCues, overrideRules);
      if (cues.length === 0) continue;
      const matchedNamesLower = new Set(
        groups[group].applied_matches.map((m) => m.name.toLowerCase()),
      );
      for (const c of cues) {
        const lower = c.name.toLowerCase();
        // Skip if catalog scan already found this entity (not new).
        // Substring check both ways for robustness against partial matches.
        const overlapsExisting = Array.from(matchedNamesLower).some(
          (existing) => lower.includes(existing) || existing.includes(lower),
        );
        if (overlapsExisting) continue;
        // Skip if same name already in suggested_new (NER might also surface it).
        const alreadyNew = groups[group].suggested_new.some(
          (s) => s.name.toLowerCase() === lower,
        );
        if (alreadyNew) continue;
        groups[group].suggested_new.push({
          name: c.name,
          slug: slugify(c.name),
          context: c.context_excerpt,
          source: "keyword",
          keyword: c.keyword,
        });
      }
    }

    // STEP 2 (NER): Brand new-entity suggestions from world knowledge.
    if (rulesFor("brand").allow_suggest_create_new) {
      const matchedBrandIds = new Set(
        groups.brand.applied_matches.map((m) => m.entity_id),
      );
      // Pre-compute normalized name index for fuzzy match against the
      // FULL catalog (not just already-matched brands). Handles the case
      // where catalog scan missed (whitespace artifact, NBSP, etc.) AND
      // the case where Sonnet returned a longer phrase containing an
      // existing brand name as substring (e.g., NER returns "Mitchell
      // and Mitchell custom hoods" but catalog has "Mitchell and
      // Mitchell" → should match the existing).
      function normalizeName(s: string): string {
        return s.toLowerCase().replace(/\s+/g, " ").trim();
      }
      const brandIndex = brandRows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        norm: normalizeName(r.name as string),
      }));

      for (const b of ner.brands) {
        const slug = slugify(b.name);
        const lowerNorm = normalizeName(b.name);

        // Find best existing-brand match: prefer the longest existing
        // name that's a substring (either direction) of the candidate.
        // Longest-match-wins keeps results stable when multiple candidates
        // could match (e.g., "Mitchell and Mitchell" beats "Mitchell").
        let bestMatch: { id: string; name: string; matchLen: number } | null = null;
        for (const existing of brandIndex) {
          if (lowerNorm.includes(existing.norm) || existing.norm.includes(lowerNorm)) {
            const matchLen = Math.min(lowerNorm.length, existing.norm.length);
            if (!bestMatch || matchLen > bestMatch.matchLen) {
              bestMatch = { id: existing.id, name: existing.name, matchLen };
            }
          }
        }

        if (bestMatch) {
          // NER candidate corresponds to an existing brand. Skip the
          // suggested_new path entirely. If catalog scan didn't already
          // surface this (e.g., regex missed due to whitespace), promote
          // it into applied_matches now so subscriber sees it as ✓
          // existing instead of `+ new`.
          if (!matchedBrandIds.has(bestMatch.id)) {
            groups.brand.applied_matches.push({
              entity_id: bestMatch.id,
              name: bestMatch.name,
              match_text: b.name,
              match_start: -1,
              context_excerpt: b.context,
            });
            matchedBrandIds.add(bestMatch.id);
          }
          continue;
        }

        // Defensive: slug-equality fallback (catches weird normalization
        // edge cases the substring check above wouldn't hit)
        const slugMatch = brandRows.find(
          (r) => slugify(r.name as string) === slug,
        );
        if (slugMatch) {
          if (!matchedBrandIds.has(slugMatch.id as string)) {
            groups.brand.applied_matches.push({
              entity_id: slugMatch.id as string,
              name: slugMatch.name as string,
              match_text: b.name,
              match_start: -1,
              context_excerpt: b.context,
            });
            matchedBrandIds.add(slugMatch.id as string);
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
        const rules = rulesFor(group);
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
