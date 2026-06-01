/**
 * POST /api/ops/brand-identity/validate
 *
 * Quality gate — context validator. Operator-authed. Per-descriptor LLM call
 * (Haiku) that reads the descriptor's coaching + each sub-input's prompt + the
 * owner's value, and returns findings per sub-input.
 *
 * Body shapes:
 *   { siteId, key }                 — validate ONE descriptor (all scopes).
 *   { siteId, key, scope: "lists" } — validate ONLY the lists group.
 *   { siteId, key, scope: { prose: "<inputKey>" } } — validate ONE prose group.
 *   { siteId }                      — validate every descriptor (no scope).
 *
 * Per [[descriptor-design-protocol]]: each descriptor's validation is split
 * into groups (one lists group + one group per prose input). Scoped calls let
 * the UI re-validate only what was edited and preserve findings for unchanged
 * scopes. Scoped persist MERGES new findings with existing findings from other
 * scopes; non-scoped persist REPLACES the whole findings array.
 *
 * Fail-open on infrastructure errors: returns the findings array with `error`
 * set on the offending descriptor; never throws.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  ensureBrandIdentity,
  setValidationFindings,
  getDescriptorFindings,
  scopeMemberKeys,
  inputKeyScope,
} from "@/lib/brand-identity/store";
import { getDescriptorByKey } from "@/lib/brand-identity/catalog";
import {
  validateDescriptor,
  validateBrandIdentity,
  type DescriptorValidationResult,
  type ScopeFilter,
} from "@/lib/brand-identity/validate";

export const maxDuration = 60;

/**
 * Persist a validation result, scope-aware. When `scope` is set, merges the
 * new findings with existing findings from OTHER scopes (preserves them).
 * When `scope` is unset, replaces the entire findings payload.
 */
async function persistResult(
  brandIdentityId: string,
  result: DescriptorValidationResult,
  scope: ScopeFilter | undefined,
) {
  if (!scope) {
    await setValidationFindings(brandIdentityId, result.key, {
      findings: result.findings,
      checkedAt: result.checkedAt,
      model: result.model,
      ...(result.error ? { error: result.error } : {}),
    });
    return;
  }
  const spec = getDescriptorByKey(result.key);
  if (!spec) return;
  const scopeId = scope.kind === "lists" ? "lists" : `prose:${scope.proseKey}`;
  const memberKeys = new Set(scopeMemberKeys(spec, scopeId));

  const existing = await getDescriptorFindings(brandIdentityId, result.key);
  const existingFindings = Array.isArray(
    (existing as { findings?: unknown })?.findings,
  )
    ? ((existing as { findings: Array<{ inputKey: string }> }).findings)
    : [];
  const otherScopeFindings = existingFindings.filter(
    (f) => !memberKeys.has(f.inputKey),
  );
  const mergedFindings = [...otherScopeFindings, ...result.findings];

  await setValidationFindings(brandIdentityId, result.key, {
    findings: mergedFindings,
    checkedAt: result.checkedAt,
    model: result.model,
    ...(result.error ? { error: result.error } : {}),
  });
}

/**
 * Returns true if existing findings already cover every key in `memberKeys`
 * (i.e. the scope was previously validated against current content per the
 * stale-on-edit guarantee — no fresh LLM call needed).
 */
function isScopeFullyCached(
  existing: Record<string, unknown> | null,
  memberKeys: Set<string>,
): boolean {
  if (!existing || "error" in existing) return false;
  const findings = Array.isArray(existing.findings)
    ? (existing.findings as Array<{ inputKey: string }>)
    : [];
  for (const k of memberKeys) {
    if (!findings.some((f) => f.inputKey === k)) return false;
  }
  return true;
}

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
  const { siteId, key } = body;
  const scope = parseScope(body.scope);
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const { brandIdentityId } = await ensureBrandIdentity(siteId);

  if (key) {
    const spec = getDescriptorByKey(key);
    if (!spec) {
      return NextResponse.json({ error: `unknown descriptor key '${key}'` }, { status: 400 });
    }

    // Scope-aware cache check: skip the LLM call when the requested scope's
    // member findings already exist (stale-on-edit guarantees they're current).
    const cached = await getDescriptorFindings(brandIdentityId, key);
    if (scope) {
      const scopeId = scope.kind === "lists" ? "lists" : `prose:${scope.proseKey}`;
      const members = new Set(scopeMemberKeys(spec, scopeId));
      if (members.size > 0 && isScopeFullyCached(cached, members)) {
        const allFindings = Array.isArray(
          (cached as { findings?: unknown })?.findings,
        )
          ? ((cached as { findings: Array<{ inputKey: string }> }).findings)
          : [];
        const scopedFindings = allFindings.filter((f) => members.has(f.inputKey));
        return NextResponse.json({
          results: [
            {
              key,
              findings: scopedFindings,
              checkedAt: (cached as { checkedAt?: string }).checkedAt ?? "",
              model: (cached as { model?: string }).model ?? "",
              cached: true,
            },
          ],
        });
      }
    } else {
      // No scope: cache hit if findings exist for EVERY in-spec input that
      // has content. Falls back to the existing whole-descriptor check.
      if (cached && !("error" in cached)) {
        return NextResponse.json({
          results: [
            {
              key,
              findings: (cached as { findings?: unknown[] }).findings ?? [],
              checkedAt: (cached as { checkedAt?: string }).checkedAt ?? "",
              model: (cached as { model?: string }).model ?? "",
              cached: true,
            },
          ],
        });
      }
    }

    const result = await validateDescriptor(brandIdentityId, key, scope);
    // Defensive: filter the result's findings to ONLY the requested scope, so
    // a model that ignores the output-key constraint can't pollute other scopes.
    if (scope) {
      const scopeId = scope.kind === "lists" ? "lists" : `prose:${scope.proseKey}`;
      const members = new Set(scopeMemberKeys(spec, scopeId));
      result.findings = result.findings.filter(
        (f) => members.has(f.inputKey) || inputKeyScope(spec, f.inputKey) === scopeId,
      );
    }
    await persistResult(brandIdentityId, result, scope);
    return NextResponse.json({ results: [result] });
  }

  const results = await validateBrandIdentity(brandIdentityId);
  for (const r of results) await persistResult(brandIdentityId, r, undefined);
  return NextResponse.json({ results });
}
