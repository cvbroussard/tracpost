import { NextResponse } from "next/server";
import { cookieDomain } from "@/lib/subdomains";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const domain = cookieDomain();
  response.cookies.set("tp_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(domain && { domain }),
  });
  return response;
}
