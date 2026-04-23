import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/leads
 * Body: { email, name?, phone?, product_id, is_trial?, source? }
 * Upserts a lead row — called on each input blur.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, name, phone, product_id, is_trial, source } = body;

  if (!email || !product_id) {
    return NextResponse.json({ error: "email and product_id required" }, { status: 400 });
  }

  const emailClean = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailClean)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  if (name && (String(name).trim().length < 2 || !/[a-zA-Z]/.test(name))) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }

  if (phone) {
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json({ error: "invalid phone" }, { status: 400 });
    }
  }

  await sql`
    INSERT INTO leads (email, name, phone, product_id, is_trial, source)
    VALUES (
      ${email.toLowerCase().trim()},
      ${name || null},
      ${phone || null},
      ${product_id},
      ${is_trial !== undefined ? is_trial : true},
      ${source || null}
    )
    ON CONFLICT (email, product_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, leads.name),
      phone = COALESCE(EXCLUDED.phone, leads.phone),
      is_trial = EXCLUDED.is_trial,
      source = COALESCE(EXCLUDED.source, leads.source)
  `;

  return NextResponse.json({ ok: true });
}
