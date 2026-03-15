import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SubscribersPage() {
  const subscribers = await sql`
    SELECT
      sub.id, sub.name, sub.plan, sub.is_active, sub.created_at,
      (SELECT COUNT(*)::int FROM sites WHERE subscriber_id = sub.id) AS site_count,
      (
        SELECT COUNT(*)::int FROM social_accounts sa
        JOIN sites s ON sa.site_id = s.id
        WHERE s.subscriber_id = sub.id AND sa.status = 'active'
      ) AS account_count,
      (
        SELECT COUNT(*)::int FROM social_posts sp
        JOIN social_accounts sa ON sp.account_id = sa.id
        JOIN sites s ON sa.site_id = s.id
        WHERE s.subscriber_id = sub.id AND sp.status = 'published'
      ) AS published_count
    FROM subscribers sub
    ORDER BY sub.created_at DESC
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Subscribers</h1>
          <p className="text-sm text-muted">All registered subscribers and their sites</p>
        </div>
        <Link
          href="/admin/subscribers/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          New Subscriber
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium text-center">Sites</th>
              <th className="px-4 py-3 font-medium text-center">Accounts</th>
              <th className="px-4 py-3 font-medium text-center">Published</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((sub) => (
              <tr key={sub.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-3">
                  <Link href={`/admin/subscribers/${sub.id}`} className="font-medium text-accent hover:underline">
                    {sub.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-surface px-2 py-0.5 text-xs">{sub.plan}</span>
                </td>
                <td className="px-4 py-3 text-center">{sub.site_count}</td>
                <td className="px-4 py-3 text-center">{sub.account_count}</td>
                <td className="px-4 py-3 text-center">{sub.published_count}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${sub.is_active ? "text-success" : "text-danger"}`}>
                    {sub.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {new Date(sub.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {subscribers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  No subscribers yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
