import { sql } from "./db";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCookie } from "./cookie-sign";
import type { Session } from "./session";

interface AdminPayload {
  admin: true;
  issued_at: number;
  expires_at: number;
}

export type PrincipalType = "platform" | "operator" | "agency" | "business" | "guest";

export interface Membership {
  scopeType: "platform" | "operator" | "account" | "business";
  scopeId: string | null; // null for cross-cutting platform/operator scopes
  role: "admin" | "member";
}

export interface AuthContext {
  userId: string;
  userName: string;
  /** The paying entity (was `subscriptionId` pre-v3). */
  accountId: string;
  /** @deprecated v3 alias for {@link accountId}. Migrate readers off this, then
   *  drop the alias in the migrate-138 cleanup. Kept so the ~228 existing
   *  `.subscriptionId` call-sites keep working through the dual-read window. */
  subscriptionId: string;
  plan: string;
  /** Legacy single role ("owner"/team role). Retained through the dual-read
   *  window; superseded by {@link memberships}. */
  role: string;
  /** True when this user owns their account (accounts.owner_user_id). Replaces
   *  the legacy role==='owner' check; computed per-request from the DB. */
  isOwner: boolean;
  /** Which surface this principal belongs to. Derived from memberships.
   *  Defaults to "business" in legacy/cookie mode (the only pre-v3 principal). */
  principalType: PrincipalType;
  /** Resolved membership rows. Empty in legacy mode and on the cookie path
   *  during the dual-read window (see note on Path 2). */
  memberships: Membership[];
  /** True when an operator authenticated via Path 3 (acting on a business's
   *  behalf) — lets routes attribute writes to the operator rather than the owner. */
  actingAsAdmin?: boolean;
}

// ── Dual-read schema bridge (v3 migrate-137) ──────────────────────
// This file ships BEFORE migrate-137 runs (deploy step 1), so it must work
// against BOTH schemas: legacy (`subscriptions`, `users.subscription_id`) and
// v3 (`accounts`, `memberships`). Each DB-backed resolver tries the v3 path
// first; if the v3 relations/columns don't exist yet, it falls back to legacy.
// Once the v3 path succeeds once, `v3Confirmed` latches on (one-way) so we stop
// attempting the legacy fallback and surface real errors thereafter.
// Remove this whole bridge in the migrate-138 cleanup.
let v3Confirmed = false;

function isMissingSchema(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (
    err?.code === "42P01" || // undefined_table
    err?.code === "42703" || // undefined_column
    /relation ".*" does not exist|column ".*" does not exist/i.test(err?.message || "")
  );
}

function derivePrincipal(memberships: Membership[]): PrincipalType {
  const types = new Set(memberships.map((m) => m.scopeType));
  if (types.has("platform")) return "platform";
  if (types.has("operator")) return "operator";
  if (types.has("account")) return "agency"; // account-scoped membership ⟺ agency (direct owners get business memberships)
  if (types.has("business")) return "business";
  return "guest";
}

type UserRow = { user_id: string; name: string; role: string; account_id: string; plan: string; owner_user_id?: string | null };

async function loadMemberships(userId: string): Promise<Membership[]> {
  const rows = await sql`
    SELECT scope_type, scope_id, role FROM memberships WHERE user_id = ${userId}
  `;
  return rows.map((m) => ({
    scopeType: m.scope_type as Membership["scopeType"],
    scopeId: (m.scope_id as string) ?? null,
    role: m.role as Membership["role"],
  }));
}

function assemble(u: UserRow, memberships: Membership[], opts?: { actingAsAdmin?: boolean }): AuthContext {
  return {
    userId: u.user_id,
    userName: u.name,
    accountId: u.account_id,
    subscriptionId: u.account_id, // deprecated alias
    plan: u.plan || "free",
    role: u.role || "owner",
    isOwner: !!u.owner_user_id && u.user_id === u.owner_user_id,
    principalType: memberships.length ? derivePrincipal(memberships) : "business",
    memberships,
    ...(opts?.actingAsAdmin ? { actingAsAdmin: true } : {}),
  };
}

/**
 * Resolve an AuthContext by user id (cookie / session-token / device-session paths).
 * Dual-read: v3 schema first, legacy fallback.
 */
async function loadContextByUserId(userId: string): Promise<AuthContext | null> {
  try {
    const rows = await sql`
      SELECT u.id AS user_id, u.name, u.role, u.billing_account_id AS account_id, a.plan, a.owner_user_id
      FROM users u JOIN accounts a ON a.id = u.billing_account_id
      WHERE u.id = ${userId} AND u.is_active = true AND a.is_active = true
    `;
    if (rows.length === 0) return null;
    const memberships = await loadMemberships(userId);
    v3Confirmed = true;
    return assemble(rows[0] as UserRow, memberships);
  } catch (e) {
    if (v3Confirmed || !isMissingSchema(e)) throw e;
    // ── legacy fallback (pre-migration only) ──
    const rows = await sql`
      SELECT u.id AS user_id, u.name, u.role, u.subscription_id AS account_id, s.plan
      FROM users u JOIN subscriptions s ON u.subscription_id = s.id
      WHERE u.id = ${userId} AND u.is_active = true AND s.is_active = true
    `;
    if (rows.length === 0) return null;
    return assemble(rows[0] as UserRow, []);
  }
}

/**
 * Resolve an AuthContext for the OWNER of an account, matched on a column of
 * the accounts/subscriptions table (api_key_hash or id). Dual-read.
 */
async function loadContextByAccountOwner(
  match: { apiKeyHash: string } | { accountId: string },
  opts?: { actingAsAdmin?: boolean }
): Promise<AuthContext | null> {
  try {
    const rows =
      "apiKeyHash" in match
        ? await sql`
            SELECT u.id AS user_id, u.name, u.role, a.id AS account_id, a.plan, a.owner_user_id
            FROM accounts a JOIN users u ON u.id = a.owner_user_id
            WHERE a.api_key_hash = ${match.apiKeyHash} AND a.is_active = true
            LIMIT 1`
        : await sql`
            SELECT u.id AS user_id, u.name, u.role, a.id AS account_id, a.plan, a.owner_user_id
            FROM accounts a JOIN users u ON u.id = a.owner_user_id
            WHERE a.id = ${match.accountId} AND a.is_active = true
            LIMIT 1`;
    if (rows.length === 0) return null;
    const memberships = await loadMemberships(rows[0].user_id as string);
    v3Confirmed = true;
    return assemble(rows[0] as UserRow, memberships, opts);
  } catch (e) {
    if (v3Confirmed || !isMissingSchema(e)) throw e;
    // ── legacy fallback (pre-migration only) ──
    const rows =
      "apiKeyHash" in match
        ? await sql`
            SELECT u.id AS user_id, u.name, u.role, s.id AS account_id, s.plan
            FROM subscriptions s JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
            WHERE s.api_key_hash = ${match.apiKeyHash} AND s.is_active = true
            LIMIT 1`
        : await sql`
            SELECT u.id AS user_id, u.name, u.role, s.id AS account_id, s.plan
            FROM subscriptions s JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
            WHERE s.id = ${match.accountId} AND s.is_active = true
            LIMIT 1`;
    if (rows.length === 0) return null;
    return assemble(rows[0] as UserRow, [], opts);
  }
}

/**
 * Authenticate a request via Bearer token (API/mobile) or session cookie (dashboard).
 *
 * Priority:
 * 1. Bearer token in Authorization header:
 *    a. Session token (tp_s_ prefix) → mobile app auth
 *    b. API key (tp_ prefix) → programmatic API auth
 *    c. Device session token (no prefix) → mobile app via QR invite
 * 2. tp_session cookie → dashboard session auth
 * 3. tp_admin cookie + account-id param → operator acting on a business's behalf
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get("authorization");

  // Path 1: Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.startsWith("tp_s_")) return authenticateBySessionToken(token);
    if (token.startsWith("tp_")) return authenticateByApiKey(token);
    return authenticateByDeviceSession(token);
  }

  // Path 2: Session cookie (dashboard calls).
  // The cookie is signed and carries values (not table refs), so it is
  // rename-safe and needs no DB round-trip here. During the dual-read window
  // every tp_session holder is a Business principal (operators use Path 3,
  // agencies don't exist yet), so principalType defaults to "business" and
  // memberships are left empty. POST-CUTOVER: bake principalType + a membership
  // summary into the cookie at login (or DB-resolve here) to make this
  // membership-aware without a per-request query.
  const cookieStore = await cookies();
  const rawSession = cookieStore.get("tp_session")?.value;
  const session = verifyCookie<Session>(rawSession);
  if (session && session.userId) {
    return {
      userId: session.userId,
      userName: session.userName,
      accountId: session.subscriptionId,
      subscriptionId: session.subscriptionId, // deprecated alias
      plan: session.plan,
      role: session.role || "owner",
      // Cookie path has no DB row; derive ownership from the cookie's role
      // (owner ⟺ role==='owner') until Phase 3 bakes it into the cookie.
      isOwner: (session.role || "owner") === "owner",
      principalType: "business",
      memberships: [],
    };
  }

  // Path 3: Admin cookie + account-id param (operator acting on behalf).
  const rawAdmin = cookieStore.get("tp_admin")?.value;
  const adminPayload = verifyCookie<AdminPayload>(rawAdmin);
  const adminValid = adminPayload?.admin === true && adminPayload.expires_at >= Date.now();
  if (adminValid) {
    const url = new URL(req.url);
    const accountId =
      url.searchParams.get("account_id") ||
      url.searchParams.get("subscription_id") ||
      url.searchParams.get("subscriber_id");
    if (accountId) {
      const ctx = await loadContextByAccountOwner({ accountId }, { actingAsAdmin: true });
      if (ctx) {
        return { ...ctx, plan: ctx.plan || "free" };
      }
    }
  }

  return NextResponse.json(
    { error: "Missing or invalid authentication" },
    { status: 401 }
  );
}

/**
 * Authenticate by API key (Bearer token).
 */
async function authenticateByApiKey(
  token: string
): Promise<AuthContext | NextResponse> {
  const apiKeyHash = await hashApiKey(token);
  const ctx = await loadContextByAccountOwner({ apiKeyHash });
  if (!ctx) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  return ctx;
}

/**
 * Authenticate by device session token (mobile app via QR invite).
 */
async function authenticateByDeviceSession(
  token: string
): Promise<AuthContext | NextResponse> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const sessionHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Resolve the user id by the hashed device token (table-agnostic — `users`
  // is not renamed), then build context through the dual-read resolver.
  const idRows = await sql`
    SELECT id FROM users WHERE session_token_hash = ${sessionHash} AND is_active = true
  `;
  if (idRows.length === 0) {
    return NextResponse.json({ error: "Invalid or revoked session" }, { status: 401 });
  }
  const ctx = await loadContextByUserId(idRows[0].id as string);
  if (!ctx) return NextResponse.json({ error: "Invalid or revoked session" }, { status: 401 });

  sql`UPDATE users SET last_active_at = NOW() WHERE session_token_hash = ${sessionHash}`.catch(() => {});
  return ctx;
}

/**
 * Hash an API key for storage using SHA-256.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Session tokens (mobile app auth) ──────────────────────────

const SESSION_TOKEN_SECRET = process.env.SESSION_TOKEN_SECRET || process.env.META_APP_SECRET || "tracpost-dev-secret";
const SESSION_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Create a signed session token for the native mobile app.
 * Format: tp_s_{userId}.{expiry}.{signature}
 */
export async function createSessionToken(userId: string): Promise<string> {
  const expiry = Date.now() + SESSION_TOKEN_TTL;
  const payload = `${userId}.${expiry}`;
  const signature = await hmacSign(payload);
  return `tp_s_${payload}.${signature}`;
}

/**
 * Authenticate by session token (mobile app Bearer token).
 */
async function authenticateBySessionToken(
  token: string
): Promise<AuthContext | NextResponse> {
  // Strip prefix: tp_s_{userId}.{expiry}.{signature}
  const raw = token.slice(5); // remove "tp_s_"
  const parts = raw.split(".");
  if (parts.length !== 3) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
  }

  const [userId, expiryStr, signature] = parts;
  const payload = `${userId}.${expiryStr}`;

  const expected = await hmacSign(payload);
  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
  }
  if (Date.now() > parseInt(expiryStr, 10)) {
    return NextResponse.json({ error: "Session token expired" }, { status: 401 });
  }

  const ctx = await loadContextByUserId(userId);
  if (!ctx) return NextResponse.json({ error: "User not found" }, { status: 401 });
  return ctx;
}

async function hmacSign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
