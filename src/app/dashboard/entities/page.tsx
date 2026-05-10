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
        <p className="mt-2 py-12 text-center text-muted">Select a business first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [brands, projects, personas, branches, siteData] = await Promise.all([
    sql`SELECT id, name, slug, url, description FROM brands WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, status, start_date, end_date, address, description, caption_mode, manual_caption_count FROM projects WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, display_name, type, consent_given, description FROM personas WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT id, name, slug, address, city, state, description, phone, is_primary FROM branches WHERE site_id = ${siteId} ORDER BY is_primary DESC, name`,
    sql`SELECT brand_label, project_label, persona_label, branch_label, service_area_label FROM sites WHERE id = ${siteId}`,
  ]);

  const site = siteData[0];

  const labels = {
    brand_label: (site?.brand_label as string) || null,
    project_label: (site?.project_label as string) || null,
    persona_label: (site?.persona_label as string) || null,
    branch_label: (site?.branch_label as string) || null,
    service_area_label: (site?.service_area_label as string) || null,
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
      branches={branches.map((b) => ({
        id: b.id as string,
        name: b.name as string,
        slug: b.slug as string,
        address: (b.address as string) || null,
        city: (b.city as string) || null,
        state: (b.state as string) || null,
        description: (b.description as string) || null,
        phone: (b.phone as string) || null,
        is_primary: !!b.is_primary,
      }))}
    />
  );
}
