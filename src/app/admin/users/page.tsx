import { sql } from "@/lib/db";
import { UsersClient, type UserRow } from "./users-client";

export const dynamic = "force-dynamic";

/**
 * Platform-wide user management (platform.tracpost.com/users).
 *
 * Lists every user across all accounts with their scope memberships, and lets
 * an operator manage memberships, business scoping, and activation. This is the
 * operational home for the v3 membership model — until now memberships were
 * migration-written and auth-read only, with no UI.
 */
export default async function UsersPage() {
  const users = await sql`
    SELECT
      u.id, u.name, u.email, u.is_active, u.created_at,
      u.billing_account_id, a.name AS account_name,
      u.business_id, b.name AS business_name,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', m.id,
          'scope_type', m.scope_type,
          'role', m.role,
          'capability', m.capability,
          'scope_id', m.scope_id,
          'scope_name', CASE m.scope_type
            WHEN 'business' THEN (SELECT name FROM businesses WHERE id = m.scope_id)
            WHEN 'account'  THEN (SELECT name FROM accounts   WHERE id = m.scope_id)
            ELSE NULL END
        ) ORDER BY m.scope_type)
        FROM memberships m WHERE m.user_id = u.id
      ), '[]'::json) AS memberships,
      COALESCE((
        SELECT json_agg(json_build_object('id', bb.id, 'name', bb.name) ORDER BY bb.name)
        FROM businesses bb WHERE bb.billing_account_id = u.billing_account_id
      ), '[]'::json) AS account_businesses
    FROM users u
    LEFT JOIN accounts a ON a.id = u.billing_account_id
    LEFT JOIN businesses b ON b.id = u.business_id
    ORDER BY a.name NULLS LAST, u.created_at
  `;

  const rows: UserRow[] = users.map((u) => ({
    id: u.id as string,
    name: (u.name as string) || null,
    email: (u.email as string) || null,
    isActive: u.is_active !== false,
    createdAt: String(u.created_at),
    billingAccountId: (u.billing_account_id as string) || null,
    accountName: (u.account_name as string) || null,
    businessId: (u.business_id as string) || null,
    businessName: (u.business_name as string) || null,
    memberships: (u.memberships as UserRow["memberships"]) || [],
    accountBusinesses: (u.account_businesses as UserRow["accountBusinesses"]) || [],
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1>Users</h1>
        <p className="mt-2 text-muted">
          Platform-wide user accounts and their scope memberships. Manage who can reach which surface —
          platform / operator / agency (account) / business.
        </p>
      </div>
      <UsersClient initialRows={rows} />
    </div>
  );
}
