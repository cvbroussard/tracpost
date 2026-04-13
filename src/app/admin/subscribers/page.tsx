import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SubscribersPage() {
  const subscribers = await sql`
    SELECT
      sub.id, sub.plan, sub.is_active, sub.created_at,
      COALESCE(owner.name, owner.email, '—') AS name,
      (SELECT COUNT(*)::int FROM sites WHERE subscription_id = sub.id) AS site_count,
      (
        SELECT COUNT(*)::int FROM social_accounts sa
        WHERE sa.subscription_id = sub.id AND sa.status = 'active'
      ) AS account_count,
      (
        SELECT COUNT(*)::int FROM social_posts sp
        JOIN social_accounts sa ON sp.account_id = sa.id
        WHERE sa.subscription_id = sub.id AND sp.status = 'published'
      ) AS published_count
    FROM subscriptions sub
    LEFT JOIN users owner ON owner.subscription_id = sub.id AND owner.role = 'owner'
    ORDER BY sub.created_at DESC
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1>Subscribers</h1>
          <p className="mt-2 text-muted">All registered subscribers and their sites</p>
        </div>
        <Link
          href="/admin/subscribers/new"
          className="bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          New Subscriber
        </Link>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-sm text-muted">
            <th className="pb-3 font-medium">Name</th>
            <th className="pb-3 font-medium">Plan</th>
            <th className="pb-3 font-medium text-center">Sites</th>
            <th className="pb-3 font-medium text-center">Accounts</th>
            <th className="pb-3 font-medium text-center">Published</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((sub) => (
            <tr key={sub.id} className="border-b border-border last:border-0 transition-colors hover:bg-surface-hover">
              <td className="py-3 pr-4">
                <Link href={`/admin/subscribers/${sub.id}`} className="font-medium text-accent hover:underline">
                  {sub.name}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <span className="rounded bg-surface-hover px-2 py-0.5 text-sm">{sub.plan}</span>
              </td>
              <td className="py-3 text-center">{sub.site_count}</td>
              <td className="py-3 text-center">{sub.account_count}</td>
              <td className="py-3 text-center">{sub.published_count}</td>
              <td className="py-3 pr-4">
                <span className={`text-sm ${sub.is_active ? "text-success" : "text-danger"}`}>
                  {sub.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="py-3 text-sm text-muted">
                {new Date(sub.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {subscribers.length === 0 && (
            <tr>
              <td colSpan={7} className="py-12 text-center text-muted">
                No subscribers yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
