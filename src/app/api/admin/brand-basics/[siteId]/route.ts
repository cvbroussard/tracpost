import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Canonical brand-level facts kept on `businesses` per migration 140.
 * These are the read/write surface for ops + (eventually) the
 * onboarding "Brand Basics" step. All three are nullable — the
 * strategic engine and downstream consumers tolerate missing values.
 */
interface BrandBasicsPayload {
  name: string | null;
  founderName: string | null;
  foundingYear: number | null;
  originContext: string | null;
}

/**
 * GET /api/admin/brand-basics/[siteId]
 *
 * Returns the canonical brand basics for a business.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await params;

  const [row] = await sql`
    SELECT name, founder_name, founding_year, origin_context
    FROM businesses WHERE id = ${siteId} LIMIT 1
  `;
  if (!row) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const payload: BrandBasicsPayload = {
    name: (row.name as string | null) ?? null,
    founderName: (row.founder_name as string | null) ?? null,
    foundingYear: (row.founding_year as number | null) ?? null,
    originContext: (row.origin_context as string | null) ?? null,
  };
  return NextResponse.json(payload);
}

/**
 * PATCH /api/admin/brand-basics/[siteId]
 *
 * Partial update of canonical brand basics. Only the fields provided
 * are touched; omitted fields are preserved. Null explicitly clears a
 * field (distinct from omitted).
 *
 * Body (all optional):
 *   {
 *     founderName?: string | null,
 *     foundingYear?: number | null,
 *     originContext?: string | null
 *   }
 *
 * Note: `name` is NOT editable through this surface — that's the
 * canonical business name, set during onboarding. To rename a
 * business, use the admin-business-edit flow (separate concern).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await params;

  let body: Partial<Omit<BrandBasicsPayload, "name">>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate founding_year if present
  if (body.foundingYear != null) {
    const y = Number(body.foundingYear);
    if (!Number.isInteger(y) || y < 1700 || y > 2200) {
      return NextResponse.json(
        { error: "foundingYear must be an integer between 1700 and 2200" },
        { status: 400 },
      );
    }
  }

  // Trim string fields; treat empty string as null (clearing intent)
  const cleanFounder =
    body.founderName === undefined
      ? undefined
      : body.founderName === null || body.founderName.trim() === ""
        ? null
        : body.founderName.trim();
  const cleanOrigin =
    body.originContext === undefined
      ? undefined
      : body.originContext === null || body.originContext.trim() === ""
        ? null
        : body.originContext.trim();
  const cleanYear =
    body.foundingYear === undefined ? undefined : body.foundingYear;

  // Build the partial update using COALESCE-style "only set if provided"
  // via a single dynamic UPDATE. We use sql tagged template fragments,
  // so a small switch chain is the most readable form.
  const updates: string[] = [];
  if (cleanFounder !== undefined) updates.push("founder_name");
  if (cleanYear !== undefined) updates.push("founding_year");
  if (cleanOrigin !== undefined) updates.push("origin_context");

  if (updates.length === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  // Three explicit cases — keeps the SQL static and parameter-safe.
  // Easier to read than dynamic SQL composition for three columns.
  const founderArg = cleanFounder === undefined ? null : cleanFounder;
  const yearArg = cleanYear === undefined ? null : cleanYear;
  const originArg = cleanOrigin === undefined ? null : cleanOrigin;
  const setFounder = cleanFounder !== undefined;
  const setYear = cleanYear !== undefined;
  const setOrigin = cleanOrigin !== undefined;

  const result = await sql`
    UPDATE businesses
    SET
      founder_name   = CASE WHEN ${setFounder} THEN ${founderArg} ELSE founder_name END,
      founding_year  = CASE WHEN ${setYear}    THEN ${yearArg}    ELSE founding_year END,
      origin_context = CASE WHEN ${setOrigin}  THEN ${originArg}  ELSE origin_context END
    WHERE id = ${siteId}
    RETURNING name, founder_name, founding_year, origin_context
  `;
  const [row] = result;
  if (!row) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    changed: updates.length,
    payload: {
      name: row.name as string | null,
      founderName: row.founder_name as string | null,
      foundingYear: row.founding_year as number | null,
      originContext: row.origin_context as string | null,
    } satisfies BrandBasicsPayload,
  });
}
