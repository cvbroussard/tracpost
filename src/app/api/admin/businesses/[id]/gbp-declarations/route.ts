/**
 * Admin endpoint — read the Cat 1 (brand identity) GBP fields for the
 * Branding pipeline step 14 drawer.
 *
 * Per the 2026-06-13 GBP-field-categorization doctrine: Branding tracks
 * only Category 1 fields (those that shape brand identity). Hours,
 * address, description (Cat 2) live on the Infrastructure GBP card with
 * their own endpoint; socialProfiles (Cat 3) not surfaced to operator.
 * Tenant continues to see everything at /dashboard/google/profile.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [row] = await sql`
    SELECT gbp_profile, gbp_sync_dirty, gbp_dirty_fields
    FROM businesses WHERE id = ${id} LIMIT 1
  `;
  if (!row) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const profile = (row.gbp_profile as Record<string, unknown> | null) ?? {};
  const serviceArea = (profile.serviceArea as Record<string, unknown> | undefined) ?? {};
  const placeInfos =
    ((serviceArea.places as Record<string, unknown> | undefined)?.placeInfos as Array<{
      placeId?: string;
      placeName?: string;
    }> | undefined) ?? [];

  // Enrich with granularity (kind) from service_areas canonical table.
  // Mirrors the subscriber-side enrichment so the drawer's read-only
  // display can show the kind badge + sort broad→narrow.
  const placeIdList = placeInfos.map((p) => p.placeId).filter((p): p is string => !!p);
  const kindMap: Record<string, string> = {};
  if (placeIdList.length > 0) {
    const kindRows = await sql`
      SELECT place_id, kind FROM service_areas
      WHERE place_id = ANY(${placeIdList}::text[])
    `;
    for (const r of kindRows) {
      kindMap[r.place_id as string] = (r.kind as string) || "city";
    }
  }
  // Cat 1 fields only per the 2026-06-13 GBP-field-categorization doctrine.
  // Cat 2 fields (hours, address, description) consumed by the Infrastructure
  // GBP card (separate endpoint); Cat 3 (socialProfiles) not surfaced to the
  // operator at all. Tenant continues to see all categories at
  // /dashboard/google/profile.
  return NextResponse.json({
    serviceAreas: placeInfos.map((p) => ({
      placeId: p.placeId ?? "",
      placeName: p.placeName ?? "(unnamed)",
      kind: kindMap[p.placeId ?? ""] ?? "city",
    })),
    serviceAreaCap: 20,
    sync: {
      dirty: !!row.gbp_sync_dirty,
      dirtyFields: (row.gbp_dirty_fields as Array<string> | null) ?? [],
      syncedAt: (profile.synced_at as string | null | undefined) ?? null,
    },
  });
}
