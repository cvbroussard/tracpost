import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { EntitiesManager } from "./entities-manager";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Entities</h1>
        <p className="mt-2 py-12 text-center text-muted">Select a site first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [brands, projects, personas, locations, siteData] = await Promise.all([
    sql`SELECT id, name, slug, url, description FROM brands WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, status, start_date, end_date, address, description, caption_mode, manual_caption_count FROM projects WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, display_name, type, consent_given, description FROM personas WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, address, city, state, description FROM locations WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT brand_label, project_label, persona_label, location_label FROM sites WHERE id = ${siteId}`,
  ]);

  const site = siteData[0];

  const labels = {
    brand_label: (site?.brand_label as string) || null,
    project_label: (site?.project_label as string) || null,
    persona_label: (site?.persona_label as string) || null,
    location_label: (site?.location_label as string) || null,
  };

  return (
    <EntitiesManager
      siteId={siteId}
      labels={labels}
      brands={brands.map((b) => ({
        id: b.id as string,
        name: b.name as string,
        slug: b.slug as string,
        url: (b.url as string) || null,
        description: (b.description as string) || null,
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
      }))}
      personas={personas.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        display_name: (c.display_name as string) || null,
        type: (c.type as string) || "person",
        consent_given: !!c.consent_given,
        description: (c.description as string) || null,
      }))}
      locations={locations.map((l) => ({
        id: l.id as string,
        name: l.name as string,
        slug: l.slug as string,
        address: (l.address as string) || null,
        city: (l.city as string) || null,
        state: (l.state as string) || null,
        description: (l.description as string) || null,
      }))}
    />
  );
}
