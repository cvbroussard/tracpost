import { sql } from "@/lib/db";
import { fetchPlaceDetails, deriveKindFromTypes } from "@/lib/reverse-geocode";

/**
 * Idempotent enrichment of a Google Place into service_areas_canonical.
 *
 * Picker onPick fires this immediately so subscriber-declared service
 * areas land in the local enriched cache without waiting for the GBP
 * push/pull round-trip. syncProfileFromGoogle fires the same logic
 * defensively for any place_id appearing in pulled GBP data that we
 * don't already know about (subscriber edited service areas directly
 * in Google's UI, etc.).
 *
 * Returns true if the row was created or updated, false on miss.
 */
export async function enrichPlace(
  placeId: string,
  placeName: string,
): Promise<boolean> {
  if (!placeId) return false;

  const details = await fetchPlaceDetails(placeId);
  if (!details) return false;

  const displayName = details.displayName || placeName || "";
  const kind = details.types.length > 0
    ? deriveKindFromTypes(details.types, displayName)
    : "city";
  const viewport = details.viewport;

  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);

  // Defensive UPSERT: ON CONFLICT (place_id) handles re-enrichment of
  // a known canonical, but it does NOT handle slug collisions. Legacy
  // orphan rows (pre-place_id-architecture) have slug='shadyside' with
  // place_id=NULL — those trip the slug-unique constraint and silently
  // fail (Pennsylvania bug 2026-05-17, Shadyside bug 2026-05-17 same
  // root cause). Fix: probe by slug first. If an orphan row exists
  // (place_id IS NULL), UPDATE it in place rather than INSERTing a
  // dup-slug row. Preserves any FK references to the orphan's id.
  const orphan = await sql`
    SELECT id FROM service_areas
    WHERE slug = ${slug} AND place_id IS NULL LIMIT 1
  `;
  if (orphan.length > 0) {
    await sql`
      UPDATE service_areas
      SET place_id = ${placeId},
          name = ${displayName},
          kind = ${kind},
          viewport = ${viewport ? JSON.stringify(viewport) : null}::jsonb
      WHERE id = ${orphan[0].id}
    `;
    return true;
  }

  await sql`
    INSERT INTO service_areas (name, slug, kind, place_id, viewport)
    VALUES (
      ${displayName},
      ${slug},
      ${kind},
      ${placeId},
      ${viewport ? JSON.stringify(viewport) : null}::jsonb
    )
    ON CONFLICT (place_id) WHERE place_id IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      viewport = COALESCE(EXCLUDED.viewport, service_areas.viewport)
  `;

  return true;
}
