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

  await sql`
    INSERT INTO service_areas_canonical (name, slug, kind, place_id, viewport)
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
      viewport = COALESCE(EXCLUDED.viewport, service_areas_canonical.viewport)
  `;

  return true;
}
