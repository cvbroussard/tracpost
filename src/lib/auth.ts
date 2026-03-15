import { sql } from "./db";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export interface AuthContext {
  subscriberId: string;
  subscriberName: string;
  plan: string;
}

/**
 * Authenticate a request via Bearer token (API) or session cookie (dashboard).
 *
 * Priority:
 * 1. Bearer token in Authorization header → API key auth
 * 2. seo_session cookie → dashboard session auth
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get("authorization");

  // Path 1: Bearer token (external API calls)
  if (authHeader?.startsWith("Bearer ")) {
    return authenticateByApiKey(authHeader.slice(7));
  }

  // Path 2: Session cookie (dashboard calls)
  const cookieStore = await cookies();
  const raw = cookieStore.get("seo_session")?.value;
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
