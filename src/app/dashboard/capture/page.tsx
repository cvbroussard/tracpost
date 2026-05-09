import { redirect } from "next/navigation";

/**
 * /dashboard/capture retired in favor of the inline UploadBar at the
 * top of /dashboard/media. Per the streamlined-upload restructure:
 * subscribers in upload-mode want minimal friction (file picker + URL
 * input only) — no staging queue, no per-item caption, no per-item AI
 * toggle. Captioning + tagging happen in the asset modal post-upload.
 *
 * Project context (?project=X&projectName=Y) passes through so the
 * "upload these 10 photos to Carter" flow keeps working.
 */
export default async function CaptureRedirect({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; projectName?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.project) qs.set("project", params.project);
  if (params.projectName) qs.set("projectName", params.projectName);
  const tail = qs.toString();
  redirect(`/dashboard/media${tail ? `?${tail}` : ""}`);
}
