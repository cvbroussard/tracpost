/**
 * Service area matcher — maps a site's GBP-declared service areas
 * against an asset's transcript + GPS. Wired into the cascade preview
 * the same way brand-match.ts is.
 *
 * Per project_tracpost_service_areas_gbp_canonical memory + the
 * 2026-05-15 architecture (commits 94f0b4d viewport + bd4a90d "JIT at
 * gen time"): service areas live in service_areas_canonical with
 * cached viewports. Matching is two-pronged:
 *
 *   1. Transcript substring match — area name appears in the transcript
 *      (fuzzy token match handles & ↔ and, capitalization, etc.)
 *   2. GPS viewport containment — asset's EXIF lat/lng falls inside the
 *      cached Place viewport (zero API calls, microseconds)
 *
 * Both paths populate `matched`. Deduped by overlay_id. No persistence —
 * matches are computed JIT on each cascade preview and at orchestrator
 * gen time (per the retired-asset-side-tagging decision).
 */
import "server-only";
import { sql } from "@/lib/db";
import {
  tokenizeWithPositions,
  tokenizeEntityName,
  findFuzzyTokenSpan,
} from "@/lib/auto-tag-rules";
import { matchAssetByViewport, type ViewportBox } from "@/lib/reverse-geocode";

export interface ServiceAreaCatalogMatch {
  /** site_service_areas.id (the subscriber's overlay row) */
  overlay_id: string;
  /** service_areas_canonical.id (the platform-canonical area) */
  canonical_id: string;
  /** Display name (e.g. "Squirrel Hill") */
  name: string;
  /** Google Place ID, if known */
  place_id: string | null;
  /** Derived kind: city / neighborhood / zip / county / state / etc. */
  kind: string;
  /** Which signal produced this match. */
  source: "transcript" | "gps";
  /** Sentence-level excerpt for transcript matches, GPS coords for gps matches. */
  context: string;
}

export interface ServiceAreaMatchResult {
  matched: ServiceAreaCatalogMatch[];
}

interface CatalogRow {
  overlay_id: string;
  canonical_id: string;
  name: string;
  place_id: string | null;
  kind: string;
  viewport: ViewportBox | null;
}

export async function matchServiceAreas(
  siteId: string,
  transcript: string,
  gpsLat?: number | null,
  gpsLng?: number | null,
): Promise<ServiceAreaMatchResult> {
  const catalogRows = await sql`
    SELECT
      sa.id AS overlay_id,
      c.id AS canonical_id,
      c.name,
      c.place_id,
      c.kind,
      c.viewport
    FROM site_service_areas sa
    JOIN service_areas_canonical c ON c.id = sa.service_area_canonical_id
    WHERE sa.site_id = ${siteId}
      AND sa.is_active = TRUE
  `;
  if (catalogRows.length === 0) return { matched: [] };

  const catalog: CatalogRow[] = catalogRows.map((r) => ({
    overlay_id: r.overlay_id as string,
    canonical_id: r.canonical_id as string,
    name: r.name as string,
    place_id: (r.place_id as string | null) ?? null,
    kind: (r.kind as string) ?? "",
    viewport: (r.viewport as ViewportBox | null) ?? null,
  }));

  const matched: ServiceAreaCatalogMatch[] = [];
  const claimed = new Set<string>();

  // Pass 1: transcript substring match (always runs when transcript exists).
  // Uses the same fuzzy token matcher that powers brand-match — so & ↔ and,
  // capitalization, and minor token punctuation drift all dissolve.
  if (transcript && transcript.trim().length > 0) {
    const transcriptTokens = tokenizeWithPositions(transcript);
    for (const entry of catalog) {
      const entityTokens = tokenizeEntityName(entry.name);
      if (entityTokens.length === 0) continue;
      const span = findFuzzyTokenSpan(transcriptTokens, entityTokens);
      if (!span) continue;
      const ctxStart = Math.max(0, span.charStart - 30);
      const ctxEnd = Math.min(transcript.length, span.charEnd + 30);
      const ctx = transcript.slice(ctxStart, ctxEnd).trim();
      const ellStart = ctxStart > 0 ? "…" : "";
      const ellEnd = ctxEnd < transcript.length ? "…" : "";
      matched.push({
        overlay_id: entry.overlay_id,
        canonical_id: entry.canonical_id,
        name: entry.name,
        place_id: entry.place_id,
        kind: entry.kind,
        source: "transcript",
        context: `${ellStart}${ctx}${ellEnd}`,
      });
      claimed.add(entry.overlay_id);
    }
  }

  // Pass 2: GPS viewport containment (only when asset has EXIF GPS).
  // Skips entries already claimed via transcript — transcript signal
  // wins for display since it's the explicit subscriber narration.
  if (gpsLat != null && gpsLng != null && Number.isFinite(gpsLat) && Number.isFinite(gpsLng)) {
    const viewportCatalog = catalog.filter((e) => e.viewport !== null);
    if (viewportCatalog.length > 0) {
      const gpsMatches = matchAssetByViewport(gpsLat, gpsLng, viewportCatalog);
      for (const m of gpsMatches) {
        if (claimed.has(m.overlayId)) continue;
        matched.push({
          overlay_id: m.overlayId,
          canonical_id: m.canonicalId,
          name: m.name,
          place_id: m.catalogPlaceId,
          kind: m.kind,
          source: "gps",
          context: `📍 Asset GPS (${gpsLat.toFixed(4)}, ${gpsLng.toFixed(4)}) within viewport`,
        });
        claimed.add(m.overlayId);
      }
    }
  }

  return { matched };
}
