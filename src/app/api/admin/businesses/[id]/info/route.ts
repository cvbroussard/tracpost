/**
 * Admin-scoped business info endpoint.
 *
 * Operator-authed mirror of the subscriber's /api/dashboard/business-info
 * + /api/dashboard/commercial-tier endpoints. The dashboard endpoints are
 * session-scoped (use session.activeSiteId); this one accepts an explicit
 * business_id from the path so the operator can edit any subscriber's
 * info via the provisioning drawer.
 *
 * GET  /api/admin/businesses/[id]/info
 *   Returns current values + the picker-tier options needed to render
 *   the inline form.
 *
 * POST /api/admin/businesses/[id]/info
 *   Body: { section: "basics" | "commercial_tier" | "contact",
 *           fields: {...section-specific fields...} }
 *   Updates the relevant columns for that section.
 *
 * Future sections (branding, web_identity, safeguard_*) land here too
 * as they're built out.
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

  const [biz] = await sql`
    SELECT s.id, s.name, s.business_type, s.location,
           s.business_phone, s.business_email,
           s.business_logo, s.business_favicon,
           s.url, s.blog_slug,
           s.face_policy, s.face_waiver_signed_at, s.face_waiver_version,
           s.minor_face_policy, s.minor_face_waiver_signed_at, s.minor_face_waiver_version,
           s.identity_policy, s.identity_waiver_signed_at, s.identity_waiver_version,
           s.commercial_tier_id, s.hosting_model,
           ct.slug AS tier_slug, ct.label AS tier_label
    FROM businesses s
    LEFT JOIN commercial_tiers ct ON ct.id = s.commercial_tier_id
    WHERE s.id = ${id}
    LIMIT 1
  `;
  if (!biz) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const [seo] = await sql`
    SELECT og_title, og_description
    FROM seo_content WHERE business_id = ${id} LIMIT 1
  `.catch(() => [null]);

  const tiers = await sql`
    SELECT id, slug, label, description
    FROM commercial_tiers
    WHERE is_target = true
    ORDER BY display_order ASC
  `;

  return NextResponse.json({
    business: {
      id: biz.id,
      name: biz.name,
      businessType: biz.business_type,
      location: biz.location,
      phone: biz.business_phone,
      email: biz.business_email,
      logoUrl: biz.business_logo,
      faviconUrl: biz.business_favicon,
      websiteUrl: biz.url,
      blogSlug: biz.blog_slug,
      ogTitle: seo?.og_title ?? null,
      ogDescription: seo?.og_description ?? null,
      facePolicy: biz.face_policy,
      faceWaiverSignedAt: biz.face_waiver_signed_at,
      minorFacePolicy: biz.minor_face_policy,
      minorFaceWaiverSignedAt: biz.minor_face_waiver_signed_at,
      identityPolicy: biz.identity_policy,
      identityWaiverSignedAt: biz.identity_waiver_signed_at,
      commercialTierId: biz.commercial_tier_id,
      tierSlug: biz.tier_slug,
      tierLabel: biz.tier_label,
      hostingModel: biz.hosting_model,
    },
    pickerTiers: tiers.map((t) => ({
      id: t.id as string,
      slug: t.slug as string,
      label: t.label as string,
      description: t.description as string,
    })),
  });
}

// Waiver versions — kept in sync with /api/site/privacy
const FACE_WAIVER_VERSION = "v1-2026-05-19";
const MINOR_FACE_WAIVER_VERSION = "v1-2026-05-19";
const IDENTITY_WAIVER_VERSION = "v1-2026-05-19";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.section !== "string" || !body.fields) {
    return NextResponse.json(
      { error: "section + fields required" },
      { status: 400 },
    );
  }

  const { section, fields } = body as { section: string; fields: Record<string, unknown> };

  if (section === "basics") {
    const name = (fields.name as string | undefined)?.trim() || null;
    const businessType = (fields.business_type as string | undefined)?.trim() || null;
    const location = (fields.location as string | undefined)?.trim() || null;
    if (!name || !businessType || !location) {
      return NextResponse.json(
        { error: "name, business_type, and location all required for basics" },
        { status: 400 },
      );
    }
    await sql`
      UPDATE businesses
      SET name = ${name}, business_type = ${businessType}, location = ${location},
          updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, section: "basics" });
  }

  if (section === "commercial_tier") {
    const tierSlug = (fields.tier_slug as string | undefined)?.trim();
    if (!tierSlug) {
      return NextResponse.json({ error: "tier_slug required" }, { status: 400 });
    }
    const [tier] = await sql`
      SELECT id FROM commercial_tiers WHERE slug = ${tierSlug} AND is_target = true LIMIT 1
    `;
    if (!tier) {
      return NextResponse.json({ error: `Unknown tier_slug "${tierSlug}"` }, { status: 400 });
    }
    await sql`
      UPDATE businesses
      SET commercial_tier_id = ${tier.id}, updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, section: "commercial_tier" });
  }

  if (section === "hosting_model") {
    // Subscriber declares whether TracPost or external infra serves the
    // website. Forks the provisioning pipeline at step 15.
    const hostingModel = (fields.hosting_model as string | undefined)?.trim();
    if (hostingModel !== "tracpost_hosted" && hostingModel !== "external_hosted") {
      return NextResponse.json(
        { error: "hosting_model must be 'tracpost_hosted' or 'external_hosted'" },
        { status: 400 },
      );
    }
    await sql`
      UPDATE businesses
      SET hosting_model = ${hostingModel}, updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, section: "hosting_model" });
  }

  if (section === "contact") {
    const phone = (fields.phone as string | undefined)?.trim() || null;
    const email = (fields.email as string | undefined)?.trim() || null;
    await sql`
      UPDATE businesses
      SET business_phone = ${phone}, business_email = ${email},
          updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, section: "contact" });
  }

  if (section === "branding") {
    // URL-based for Phase 1 — media library picker comes in Phase 2.
    const logoUrl = (fields.logo_url as string | undefined)?.trim() || null;
    const faviconUrl = (fields.favicon_url as string | undefined)?.trim() || null;
    await sql`
      UPDATE businesses
      SET business_logo = ${logoUrl}, business_favicon = ${faviconUrl},
          updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, section: "branding" });
  }

  if (section === "web_identity") {
    // URL + blog_slug live on businesses; OG title/description on seo_content.
    const url = (fields.url as string | undefined)?.trim() || null;
    const blogSlug = (fields.blog_slug as string | undefined)?.trim() || null;
    const ogTitle = (fields.og_title as string | undefined)?.trim() || null;
    const ogDescription = (fields.og_description as string | undefined)?.trim() || null;

    await sql`
      UPDATE businesses
      SET url = ${url}, blog_slug = ${blogSlug}, updated_at = NOW()
      WHERE id = ${id}
    `;

    // Upsert into seo_content for OG fields (one row per business).
    if (ogTitle !== null || ogDescription !== null) {
      await sql`
        INSERT INTO seo_content (business_id, og_title, og_description)
        VALUES (${id}, ${ogTitle}, ${ogDescription})
        ON CONFLICT (business_id) DO UPDATE
          SET og_title = EXCLUDED.og_title,
              og_description = EXCLUDED.og_description
      `.catch((e) => console.error("seo_content upsert failed:", e));
    }
    return NextResponse.json({ success: true, section: "web_identity" });
  }

  // Safeguard sections — set policy and (when sign_waiver=true) stamp the
  // waiver_signed_at + version. The admin override pattern: operator can
  // sign on behalf of subscriber during white-glove. Subscriber-side flow
  // remains at /api/site/privacy.
  if (section === "safeguard_faces") {
    const policy = fields.policy as string | undefined;
    const signWaiver = fields.sign_waiver === true;
    if (policy && !["asis", "box", "blur", "suppress"].includes(policy)) {
      return NextResponse.json({ error: `Invalid face policy "${policy}"` }, { status: 400 });
    }
    if (signWaiver) {
      await sql`
        UPDATE businesses
        SET face_policy = ${policy || "blur"},
            face_waiver_signed_at = NOW(),
            face_waiver_version = ${FACE_WAIVER_VERSION},
            updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (policy) {
      await sql`
        UPDATE businesses
        SET face_policy = ${policy}, updated_at = NOW()
        WHERE id = ${id}
      `;
    }
    return NextResponse.json({ success: true, section: "safeguard_faces" });
  }

  if (section === "safeguard_minors") {
    const policy = fields.policy as string | undefined;
    const signWaiver = fields.sign_waiver === true;
    if (policy && !["asis", "box", "blur", "suppress"].includes(policy)) {
      return NextResponse.json({ error: `Invalid minor face policy "${policy}"` }, { status: 400 });
    }
    if (signWaiver) {
      await sql`
        UPDATE businesses
        SET minor_face_policy = ${policy || "blur"},
            minor_face_waiver_signed_at = NOW(),
            minor_face_waiver_version = ${MINOR_FACE_WAIVER_VERSION},
            updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (policy) {
      await sql`
        UPDATE businesses
        SET minor_face_policy = ${policy}, updated_at = NOW()
        WHERE id = ${id}
      `;
    }
    return NextResponse.json({ success: true, section: "safeguard_minors" });
  }

  if (section === "safeguard_identity") {
    const policy = fields.policy as string | undefined;
    const signWaiver = fields.sign_waiver === true;
    if (policy && !["allow_names", "anonymize"].includes(policy)) {
      return NextResponse.json({ error: `Invalid identity policy "${policy}"` }, { status: 400 });
    }
    if (signWaiver) {
      await sql`
        UPDATE businesses
        SET identity_policy = ${policy || "anonymize"},
            identity_waiver_signed_at = NOW(),
            identity_waiver_version = ${IDENTITY_WAIVER_VERSION},
            updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (policy) {
      await sql`
        UPDATE businesses
        SET identity_policy = ${policy}, updated_at = NOW()
        WHERE id = ${id}
      `;
    }
    return NextResponse.json({ success: true, section: "safeguard_identity" });
  }

  return NextResponse.json(
    { error: `Unknown section "${section}"` },
    { status: 400 },
  );
}
