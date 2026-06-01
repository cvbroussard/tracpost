/**
 * POST /api/ops/brand-identity/reset-original
 *
 * Owner explicit reset: clears `owner_original`, `extracted_substrate`,
 * `validationFindings`, AND `declared` content for the affected sub-inputs.
 * Used when the owner wants to start over from scratch after a hype-only
 * first attempt (or any other case where the canonical content is no longer
 * representative).
 *
 * Per [[brand-identity-schema]] owners-embellish principle: the substrate-
 * conditional lock handles the natural iteration case (owner re-enters when
 * substrate is empty). Reset is the explicit escape hatch for "I want to
 * start over even though substrate is already locked."
 *
 * Body shapes:
 *   { siteId, key }                              — reset whole descriptor
 *   { siteId, key, scope: "lists" }              — reset the lists group
 *   { siteId, key, scope: { prose: "<inputKey>" } } — reset one prose input
 *
 * Operator-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  ensureBrandIdentity,
  resetOwnerOriginal,
} from "@/lib/brand-identity/store";

function parseScope(
  raw: unknown,
): "lists" | { prose: string } | undefined {
  if (raw === "lists") return "lists";
  if (raw && typeof raw === "object" && "prose" in raw) {
    const p = (raw as { prose: unknown }).prose;
    if (typeof p === "string" && p.length > 0) return { prose: p };
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { siteId, key } = body;
  const scope = parseScope(body.scope);
  if (!siteId || !key) {
    return NextResponse.json(
      { error: "siteId and key required" },
      { status: 400 },
    );
  }
  const { brandIdentityId } = await ensureBrandIdentity(siteId);
  await resetOwnerOriginal(brandIdentityId, key, scope);
  return NextResponse.json({ ok: true });
}
