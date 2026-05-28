import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { captureLogoAsHeroAsset } from "@/lib/brand-enrich";

/**
 * PATCH /api/brands/:id — update a brand
 * Body: { name?, url?, description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [brand] = await sql`
    SELECT b.id, b.business_id, b.name, b.url FROM brands b
    JOIN businesses s ON b.business_id = s.id
    WHERE b.id = ${id} AND s.billing_account_id = ${auth.subscriptionId}
  `;
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE brands SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.url !== undefined) {
    await sql`UPDATE brands SET url = ${body.url || null} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE brands SET description = ${body.description || null} WHERE id = ${id}`;
  }
  if (body.hero_asset_id !== undefined) {
    await sql`UPDATE brands SET hero_asset_id = ${body.hero_asset_id || null} WHERE id = ${id}`;
  }
  // Manual logo paste: subscriber found a logo URL anywhere on the web,
  // we download → R2 → media_asset → set hero_asset_id. Same pipeline
  // the automated stages use, just triggered explicitly. Lets the
  // subscriber recover any brand the automation couldn't get
  // (e.g. Brizo behind premium WAF, or vendors without web presence).
  if (typeof body.hero_image_url === "string" && body.hero_image_url.trim()) {
    const heroUrl = body.hero_image_url.trim();
    const heroAssetId = await captureLogoAsHeroAsset(
      brand.site_id as string,
      id,
      brand.name as string,
      (brand.url as string) || heroUrl,
      heroUrl,
    );
    if (heroAssetId) {
      await sql`UPDATE brands SET hero_asset_id = ${heroAssetId} WHERE id = ${id}`;
    } else {
      return NextResponse.json(
        { error: "Could not fetch a valid image from that URL. Check that it points to a publicly-accessible image file." },
        { status: 400 },
      );
    }
  }

  const [updated] = await sql`
    SELECT b.id, b.name, b.slug, b.url, b.description, b.hero_asset_id,
           b.logo_service_url, ma.storage_url AS hero_url
    FROM brands b
    LEFT JOIN media_assets ma ON ma.id = b.hero_asset_id
    WHERE b.id = ${id}
  `;
  return NextResponse.json({ brand: updated });
}

/**
 * DELETE /api/brands/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  await sql`
    DELETE FROM brands b
    USING businesses s
    WHERE b.business_id = s.id AND b.id = ${id} AND s.billing_account_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
