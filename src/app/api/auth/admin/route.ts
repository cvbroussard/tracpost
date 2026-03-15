import { NextRequest, NextResponse } from "next/server";
import { cookieDomain } from "@/lib/subdomains";

/**
 * POST /api/auth/admin — Admin login with shared secret.
 * Body: { password }
 */
export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const domain = cookieDomain();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tp_admin", "authenticated", {
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
