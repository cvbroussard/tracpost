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

export interface AuthContext {
  userId: string;
  userName: string;
  subscriptionId: string;
  plan: string;
  role: string;
}

/**
 * Authenticate a request via Bearer token (API/mobile) or session cookie (dashboard).
 *
 * Priority:
 * 1. Bearer token in Authorization header:
 *    a. Session token (tp_s_ prefix) → mobile app auth
 *    b. API key (tp_ prefix) → programmatic API auth
 * 2. tp_session cookie → dashboard session auth
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get("authorization");

  // Path 1: Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Session tokens (mobile app) have tp_s_ prefix
    if (token.startsWith("tp_s_")) {
      return authenticateBySessionToken(token);
    }
    // API keys have tp_ prefix (no s_)
    if (token.startsWith("tp_")) {
      return authenticateByApiKey(token);
    }
    // Device session tokens (mobile app via QR invite) — no prefix
    return authenticateByDeviceSession(token);
  }

  // Path 2: Session cookie (dashboard calls)
  const cookieStore = await cookies();
  const rawSession = cookieStore.get("tp_session")?.value;
  const session = verifyCookie<Session>(rawSession);
  if (session && session.userId) {
    return {
      userId: session.userId,
      userName: session.userName,
      subscriptionId: session.subscriptionId,
      plan: session.plan,
      role: session.role || "owner",
    };
  }

  // Path 3: Admin cookie + subscription_id param (admin acting on behalf)
  const rawAdmin = cookieStore.get("tp_admin")?.value;
  const adminPayload = verifyCookie<AdminPayload>(rawAdmin);
  const adminValid = adminPayload?.admin === true && adminPayload.expires_at >= Date.now();
  if (adminValid) {
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get("subscription_id") || url.searchParams.get("subscriber_id");
    if (subscriptionId) {
      const [sub] = await sql`
        SELECT s.id AS subscription_id, s.plan, u.id AS user_id, u.name, u.role
        FROM subscriptions s
        JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
        WHERE s.id = ${subscriptionId} AND s.is_active = true
        LIMIT 1
      `;
      if (sub) {
        return {
          userId: sub.user_id as string,
          userName: sub.name as string,
          subscriptionId: sub.subscription_id as string,
          plan: (sub.plan as string) || "free",
          role: (sub.role as string) || "owner",
        };
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
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const rows = await sql`
    SELECT s.id AS subscription_id, s.plan,
           u.id AS user_id, u.name, u.role
    FROM subscriptions s
    JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
    WHERE s.api_key_hash = ${apiKeyHash}
      AND s.is_active = true
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  return {
    userId: rows[0].user_id as string,
    userName: rows[0].name as string,
    subscriptionId: rows[0].subscription_id as string,
    plan: rows[0].plan as string,
    role: rows[0].role as string,
  };
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
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sessionHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const rows = await sql`
    SELECT u.id AS user_id, u.name, u.role, u.subscription_id,
           s.plan
    FROM users u
    JOIN subscriptions s ON u.subscription_id = s.id
    WHERE u.session_token_hash = ${sessionHash}
      AND u.is_active = true
      AND s.is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid or revoked session" }, { status: 401 });
  }

  // Update last active
  sql`
    UPDATE users SET last_active_at = NOW()
    WHERE session_token_hash = ${sessionHash}
  `.catch(() => {});

  return {
    userId: rows[0].user_id as string,
    userName: rows[0].name as string,
    subscriptionId: rows[0].subscription_id as string,
    plan: (rows[0].plan as string) || "free",
    role: (rows[0].role as string) || "owner",
  };
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

  // Verify signature
  const expected = await hmacSign(payload);
  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
  }

  // Check expiry
  if (Date.now() > parseInt(expiryStr, 10)) {
    return NextResponse.json({ error: "Session token expired" }, { status: 401 });
  }

  // Look up user + subscription
  const rows = await sql`
    SELECT u.id AS user_id, u.name, u.role, u.subscription_id,
           s.plan
    FROM users u
    JOIN subscriptions s ON u.subscription_id = s.id
    WHERE u.id = ${userId} AND u.is_active = true AND s.is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  return {
    userId: rows[0].user_id as string,
    userName: rows[0].name as string,
    subscriptionId: rows[0].subscription_id as string,
    plan: rows[0].plan as string,
    role: rows[0].role as string,
  };
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
