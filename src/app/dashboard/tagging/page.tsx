import { sql } from "@/lib/db";
import { getSession, sessionDisplayRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { TaggingManager } from "./tagging-manager";

export const dynamic = "force-dynamic";

export default async function TaggingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Tagging</h1>
        <p className="mt-2 py-12 text-center text-muted">Select a business first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [brands, projects, branches, services, siteData] = await Promise.all([
    sql`SELECT b.id, b.name, b.slug, b.url, b.description, b.hero_asset_id,
            b.logo_service_url, ma.storage_url AS hero_url
        FROM brands b
        LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
        WHERE b.business_id = ${siteId}
        ORDER BY b.name`,
    sql`SELECT id, name, slug, status, start_date, end_date, address, description,
            caption_mode, manual_caption_count, hero_asset_id, metadata,
            place_id, gps_lat, gps_lng
        FROM projects WHERE business_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, address, city, state, description,
            phone, hours, gbp_profile_id AS gbp_location_id, is_primary, hero_asset_id, metadata
        FROM locations WHERE business_id = ${siteId} ORDER BY is_primary DESC, name`,
    sql`SELECT id, name, slug, description, price_range, duration, display_order,
            hero_asset_id, metadata, source
        FROM services WHERE business_id = ${siteId} ORDER BY display_order ASC, name ASC`,
    sql`SELECT brand_label, project_label, persona_label, branch_label, service_label
        FROM businesses WHERE id = ${siteId}`,
  ]);
  // Personas retired 2026-05-19.
  const personas: Array<Record<string, unknown>> = [];

  const site = siteData[0];

  const labels = {
    brand_label: (site?.brand_label as string) || null,
    project_label: (site?.project_label as string) || null,
    persona_label: (site?.persona_label as string) || null,
    branch_label: (site?.branch_label as string) || null,
    service_label: (site?.service_label as string) || null,
  };

  return (
    <TaggingManager
      siteId={siteId}
      labels={labels}
      role={sessionDisplayRole(session)}
      brands={brands.map((b) => ({
        id: b.id as string,
        name: b.name as string,
        slug: b.slug as string,
        url: (b.url as string) || null,
        description: (b.description as string) || null,
        hero_asset_id: (b.hero_asset_id as string) || null,
        hero_url: (b.hero_url as string) || null,
        logo_service_url: (b.logo_service_url as string) || null,
      }))}
      projects={projects.map((p) => ({
        id: p.id as string,
        name: p.name as string,
        slug: p.slug as string,
        status: (p.status as string) || "active",
        start_date: p.start_date ? new Date(p.start_date as string).toISOString().slice(0, 10) : null,
        end_date: p.end_date ? new Date(p.end_date as string).toISOString().slice(0, 10) : null,
        address: (p.address as string) || null,
        description: (p.description as string) || null,
        caption_mode: (p.caption_mode as string) || "seeding",
        manual_caption_count: (p.manual_caption_count as number) || 0,
        hero_asset_id: (p.hero_asset_id as string) || null,
        metadata: (p.metadata as Record<string, unknown>) || {},
        place_id: (p.place_id as string) || null,
        gps_lat: p.gps_lat != null ? Number(p.gps_lat) : null,
        gps_lng: p.gps_lng != null ? Number(p.gps_lng) : null,
      }))}
      personas={personas.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        display_name: (c.display_name as string) || null,
        type: (c.type as string) || "person",
        consent_given: !!c.consent_given,
        description: (c.description as string) || null,
        visual_cues: (c.visual_cues as string[]) || [],
        narrative_context: (c.narrative_context as string) || null,
        relationships: (c.relationships as Record<string, unknown>) || {},
        appearance_count: (c.appearance_count as number) || 0,
        first_seen_at: c.first_seen_at ? new Date(c.first_seen_at as string).toISOString() : null,
        last_seen_at: c.last_seen_at ? new Date(c.last_seen_at as string).toISOString() : null,
        hero_asset_id: (c.hero_asset_id as string) || null,
        metadata: (c.metadata as Record<string, unknown>) || {},
      }))}
      branches={branches.map((b) => ({
        id: b.id as string,
        name: b.name as string,
        slug: b.slug as string,
        address: (b.address as string) || null,
        city: (b.city as string) || null,
        state: (b.state as string) || null,
        description: (b.description as string) || null,
        phone: (b.phone as string) || null,
        hours: (b.hours as Record<string, unknown>) || {},
        gbp_location_id: (b.gbp_location_id as string) || null,
        is_primary: !!b.is_primary,
        hero_asset_id: (b.hero_asset_id as string) || null,
        metadata: (b.metadata as Record<string, unknown>) || {},
      }))}
      services={services.map((s) => ({
        id: s.id as string,
        name: s.name as string,
        slug: s.slug as string,
        description: (s.description as string) || null,
        price_range: (s.price_range as string) || null,
        duration: (s.duration as string) || null,
        display_order: (s.display_order as number) || 0,
        hero_asset_id: (s.hero_asset_id as string) || null,
        metadata: (s.metadata as Record<string, unknown>) || {},
        source: (s.source as string) || "manual",
      }))}
    />
  );
}
