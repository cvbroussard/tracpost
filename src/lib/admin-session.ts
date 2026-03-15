import { cookies } from "next/headers";

const COOKIE_NAME = "tp_admin";
const TOKEN_VALUE = "authenticated";

/**
 * Check if the current request has a valid admin session.
 */
export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === TOKEN_VALUE;
}
