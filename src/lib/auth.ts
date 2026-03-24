import { sql } from "./db";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export interface AuthContext {
  subscriberId: string;
  subscriberName: string;
  plan: string;
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
    return authenticateByApiKey(token);
  }

  // Path 2: Session cookie (dashboard calls)
  const cookieStore = await cookies();
  const raw = cookieStore.get("tp_session")?.value;
  if (raw) {
    try {
      const session = JSON.parse(raw);
      if (session.subscriberId) {
        return {
          subscriberId: session.subscriberId,
          subscriberName: session.subscriberName,
          plan: session.plan,
        };
      }
    } catch {
      // Invalid cookie, fall through
    }
  }

  // Path 3: Admin cookie + subscriber_id param (admin acting on behalf of subscriber)
  const adminCookie = cookieStore.get("tp_admin")?.value;
  if (adminCookie === "authenticated") {
    const url = new URL(req.url);
    const subscriberId = url.searchParams.get("subscriber_id");
    if (subscriberId) {
      const [sub] = await sql`
        SELECT id, name, plan FROM subscribers WHERE id = ${subscriberId} AND is_active = true
      `;
      if (sub) {
        return {
          subscriberId: sub.id as string,
          subscriberName: sub.name as string,
          plan: (sub.plan as string) || "free",
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
    SELECT id, name, plan
    FROM subscribers
    WHERE api_key_hash = ${apiKeyHash}
      AND is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  return {
    subscriberId: rows[0].id,
    subscriberName: rows[0].name,
    plan: rows[0].plan,
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
 * Format: tp_s_{subscriberId}.{expiry}.{signature}
 */
export async function createSessionToken(subscriberId: string): Promise<string> {
  const expiry = Date.now() + SESSION_TOKEN_TTL;
  const payload = `${subscriberId}.${expiry}`;
  const signature = await hmacSign(payload);
  return `tp_s_${payload}.${signature}`;
}

/**
 * Authenticate by session token (mobile app Bearer token).
 */
async function authenticateBySessionToken(
  token: string
): Promise<AuthContext | NextResponse> {
  // Strip prefix: tp_s_{subscriberId}.{expiry}.{signature}
  const raw = token.slice(5); // remove "tp_s_"
  const parts = raw.split(".");
  if (parts.length !== 3) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
  }

  const [subscriberId, expiryStr, signature] = parts;
  const payload = `${subscriberId}.${expiryStr}`;

  // Verify signature
  const expected = await hmacSign(payload);
  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
  }

  // Check expiry
  if (Date.now() > parseInt(expiryStr, 10)) {
    return NextResponse.json({ error: "Session token expired" }, { status: 401 });
  }

  // Look up subscriber
  const rows = await sql`
    SELECT id, name, plan
    FROM subscribers
    WHERE id = ${subscriberId} AND is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 401 });
  }

  return {
    subscriberId: rows[0].id,
    subscriberName: rows[0].name,
    plan: rows[0].plan,
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
