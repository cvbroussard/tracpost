import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { hashApiKey } from "@/lib/auth";
import { sql } from "@/lib/db";
import { randomBytes } from "crypto";

/**
 * POST /api/auth/api-key
 *
 * Regenerate the subscriber's API key. Requires active dashboard session.
 * Old key is immediately invalidated. New key returned once.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const apiKey = `tp_${randomBytes(24).toString("hex")}`;
  const apiKeyHash = await hashApiKey(apiKey);

  await sql`
    UPDATE subscribers
    SET api_key_hash = ${apiKeyHash}, updated_at = NOW()
    WHERE id = ${session.subscriberId}
  `;

  return NextResponse.json({ api_key: apiKey });
}
