/**
 * Admin endpoint — read the owner-declared GBP profile fields for the
 * step 14 drawer (read-only operator observability).
 *
 * Per the doctrine: subscriber declares everything at /dashboard/google/profile;
 * operator observes via this drawer. No edits surfaced server-side.
 *
 * Source: businesses.gbp_profile JSONB. Mirrors what subscriber sees on
 * their dashboard but rendered as a static snapshot.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

// Platform → human-readable label. Keys match the lowercase platform names
// stored in gbp_profile.socialProfiles[].platform (per the SOCIAL_PLATFORMS
// constant in src/lib/gbp/profile.ts). Tenant UI and operator UI now read
// the same shape per the 2026-06-11 audit fix.
const GBP_SOCIAL_CHANNEL_DEFAULTS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
};

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
  const address = (profile.address as Record<string, unknown> | undefined) ?? {};
  const regularHours = (profile.regularHours as Array<{
    day?: string;
    openTime?: string;
    closeTime?: string;
  }> | undefined) ?? [];
  // socialProfiles shape per src/lib/gbp/profile.ts GbpProfile interface +
  // parseAttributesResponse writer: { platform: string, url: string }.
  // Previously this route read { channel, uri } which never resolved →
  // operator's read of social profiles was always empty even when the
  // tenant had declared them. Fixed 2026-06-11.
  const socialProfiles = (profile.socialProfiles as Array<{
    platform?: string;
    url?: string;
  }> | undefined) ?? [];

  return NextResponse.json({
    serviceAreas: placeInfos.map((p) => ({
      placeId: p.placeId ?? "",
      placeName: p.placeName ?? "(unnamed)",
      kind: kindMap[p.placeId ?? ""] ?? "city",
    })),
    serviceAreaCap: 20,
    showAddress: serviceArea.businessType === "CUSTOMER_AND_BUSINESS_LOCATION",
    address: {
      addressLines: (address.addressLines as Array<string> | undefined) ?? [],
      locality: (address.locality as string | null) ?? null,
      administrativeArea: (address.administrativeArea as string | null) ?? null,
      postalCode: (address.postalCode as string | null) ?? null,
    },
    hours: regularHours.map((h) => ({
      day: h.day ?? "",
      openTime: h.openTime ?? "",
      closeTime: h.closeTime ?? "",
    })),
    description: (profile.description as string | null) ?? null,
    socialProfiles: socialProfiles.map((p) => ({
      channel: p.platform ?? "",
      channelLabel: GBP_SOCIAL_CHANNEL_DEFAULTS[p.platform ?? ""] ?? (p.platform ?? "Unknown"),
      uri: p.url ?? "",
    })),
    sync: {
      dirty: !!row.gbp_sync_dirty,
      dirtyFields: (row.gbp_dirty_fields as Array<string> | null) ?? [],
      // synced_at lives on the gbp_profile JSONB blob itself, written by
      // syncProfileFromGoogle on each pull. Operator surfaces this in the
      // drawer header to make staleness visible.
      syncedAt: (profile.synced_at as string | null | undefined) ?? null,
    },
  });
}
