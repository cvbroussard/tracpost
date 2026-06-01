/**
 * POST /api/ops/brand-identity/validate-stability  { siteId, key, n? }
 *
 * Diagnostic stability test — fires N parallel validations of ONE descriptor
 * against the same input. Returns all N results without persisting any to
 * `metadata.validationFindings`. Used for self-consistency testing of the
 * validator prompt (see prompt-stability methodology in memory).
 *
 * Default N=5, max N=10.
 *
 * Operator-only by design; not exposed to subscribers. Cost ~$0.01 per run
 * (~$0.05 per default 5-run test).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { ensureBrandIdentity } from "@/lib/brand-identity/store";
import { validateDescriptor, type ScopeFilter } from "@/lib/brand-identity/validate";

export const maxDuration = 60;

function parseScope(raw: unknown): ScopeFilter | undefined {
  if (raw === "lists") return { kind: "lists" };
  if (raw && typeof raw === "object" && "prose" in raw) {
    const p = (raw as { prose: unknown }).prose;
    if (typeof p === "string" && p.length > 0) return { kind: "prose", proseKey: p };
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { siteId, key, n } = body;
  const scope = parseScope(body.scope);
  if (!siteId || !key) {
    return NextResponse.json(
      { error: "siteId and key required" },
      { status: 400 },
    );
  }
  const runs = Math.min(
    Math.max(typeof n === "number" ? n : parseInt(String(n)) || 5, 1),
    10,
  );
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  // Diagnostic only — no persistence, no metadata writes. Scope-aware so the
  // owner can test stability per-group (one lists call ×5, or one prose call ×5).
  const results = await Promise.all(
    Array.from({ length: runs }, () => validateDescriptor(brandIdentityId, key, scope)),
  );
  return NextResponse.json({ results });
}
