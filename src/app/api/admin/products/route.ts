import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/admin/products — list all products
 * POST /api/admin/products — create a product
 * PATCH /api/admin/products — update a product
 * DELETE /api/admin/products — deactivate a product
 */

export async function GET() {
  const products = await sql`
    SELECT id, name, tagline, price, frequency, features, cta_text, cta_href,
           highlight, sort_order, stripe_price_id, is_active, created_at
    FROM products
    ORDER BY sort_order ASC, created_at ASC
  `;
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, tagline, price, frequency, features, cta_text, cta_href, highlight, sort_order, stripe_price_id } = body;

  if (!name || !price) {
    return NextResponse.json({ error: "name and price required" }, { status: 400 });
  }

  const [product] = await sql`
    INSERT INTO products (name, tagline, price, frequency, features, cta_text, cta_href, highlight, sort_order, stripe_price_id)
    VALUES (
      ${name},
      ${tagline || null},
      ${price},
      ${frequency || "/month"},
      ${JSON.stringify(features || [])},
      ${cta_text || "Start 14-day trial"},
      ${cta_href || null},
      ${highlight || false},
      ${sort_order || 0},
      ${stripe_price_id || null}
    )
    RETURNING id, name
  `;

  return NextResponse.json({ product });
}

export async function PATCH(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await sql`
    UPDATE products SET
      name = ${body.name},
      tagline = ${body.tagline || null},
      price = ${body.price},
      frequency = ${body.frequency || "/month"},
      features = ${JSON.stringify(body.features || [])},
      cta_text = ${body.cta_text || "Start 14-day trial"},
      cta_href = ${body.cta_href || null},
      highlight = ${body.highlight || false},
      sort_order = ${body.sort_order || 0},
      stripe_price_id = ${body.stripe_price_id || null},
      is_active = ${body.is_active !== undefined ? body.is_active : true},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await sql`UPDATE products SET is_active = false, updated_at = NOW() WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
