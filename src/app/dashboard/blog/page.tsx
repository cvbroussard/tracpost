import { redirect } from "next/navigation";

/**
 * /dashboard/blog retired per #171.
 *
 * Per #155 the v2 generator + Unifeed are the article source of truth. This
 * page now redirects all traffic — including legacy bookmarks and
 * incoming links from older pieces of the dashboard — to /dashboard/unifeed
 * with the blog filter preselected. Status query params (status=draft,
 * status=published, etc.) pass through so existing links keep their intent.
 */
export default async function BlogRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusParam = params.status ? `&status=${encodeURIComponent(params.status)}` : "";
  redirect(`/dashboard/unifeed?platform=blog${statusParam}`);
}
