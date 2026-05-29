import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Agency landing — the client roster. Thin shell: lists the businesses under
 * the agency's account. Per-client curation tools land in a later phase (the
 * reskin-vs-separate-build decision is still open).
 */
export default async function AgyHome() {
  const session = await getSession();
  if (!session) redirect("/login");

  const businesses = session.subscriptionId
    ? await sql`
        SELECT id, name, url, is_active
        FROM businesses
        WHERE billing_account_id = ${session.subscriptionId}
        ORDER BY is_active DESC, name ASC
      `
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Client roster</h1>
        <p className="mt-1 text-sm text-muted">
          The businesses your agency manages. Select a client to review and
          approve their content.
        </p>
      </div>

      {businesses.length === 0 ? (
        <div className="rounded border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">No clients yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Once businesses are added to your agency account they’ll appear here.
            From each client you’ll review and approve content before it publishes.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {businesses.map((b) => (
            <li
              key={b.id as string}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {(b.name as string) || "Untitled"}
                </div>
                {b.url ? (
                  <div className="truncate text-xs text-muted">{b.url as string}</div>
                ) : null}
              </div>
              <span
                className={`text-xs ${b.is_active !== false ? "text-success" : "text-danger"}`}
              >
                {b.is_active !== false ? "active" : "inactive"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
