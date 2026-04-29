import { NextRequest, NextResponse } from "next/server";
import { cookieDomain } from "@/lib/subdomains";
import { signCookie } from "@/lib/cookie-sign";

/**
 * POST /api/auth/admin — Admin login with shared secret.
 * Body: { password }
 *
 * Issues an HMAC-signed admin cookie (tp_admin). The cookie payload
 * carries issued_at + expires_at; tampering breaks the signature.
 */
export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const signed = signCookie({
    admin: true,
    issued_at: now,
    expires_at: now + sevenDaysMs,
  });

  const domain = cookieDomain();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tp_admin", signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    ...(domain && { domain }),
  });

  return response;
}

/**
 * DELETE /api/auth/admin — Admin logout.
 */
export async function DELETE() {
  const domain = cookieDomain();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tp_admin", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(domain && { domain }),
  });
  return response;
}
