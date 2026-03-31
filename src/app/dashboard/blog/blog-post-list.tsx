"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { markdownToHtml, blogProseStyles } from "@/lib/blog/markdown";

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  og_image_url: string | null;
  status: string;
  content_type: string | null;
  content_pillar: string | null;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
}

interface Counts {
  total: number;
  draft: number;
  published: number;
  flagged: number;
}

const statusStyles: Record<string, string> = {
  draft: "bg-muted/20 text-muted",
  published: "bg-success/20 text-success",
  flagged: "bg-danger/20 text-danger",
};

export function BlogPostList({
  posts,
  statusFilter,
  sortOrder,
  currentPage,
  totalPages,
  totalCount,
  counts,
}: {
  posts: Post[];
  statusFilter: string;
  sortOrder: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  counts: Counts;
}) {
  const router = useRouter();
  const [previewing, setPreviewing] = useState<Post | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [repromptUrl, setRepromptUrl] = useState<string | null>(null);
  const [repromptNote, setRepromptNote] = useState("");
  const [repromptMode, setRepromptMode] = useState<"edit" | "new" | "replace">("edit");
  const [reprompting, setReprompting] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { status: statusFilter, sort: sortOrder, page: String(currentPage), ...updates };
    // Reset to page 1 when changing filters/sort
    if (updates.status || updates.sort) merged.page = "1";
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && v !== "newest" && !(k === "page" && v === "1")) {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    router.push(`/dashboard/blog${qs ? `?${qs}` : ""}`);
  }

  async function approvePost(postId: string) {
    setActing(postId);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", post_id: postId }),
      });
      setPreviewing(null);
      router.refresh();
    } catch {
      alert("Failed to publish");
    } finally {
      setActing(null);
    }
  }

  async function rejectPost(postId: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setActing(postId);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", post_id: postId }),
      });
      setPreviewing(null);
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setActing(null);
    }
  }

  async function unpublishPost(postId: string) {
    setActing(postId);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish", post_id: postId }),
      });
      setPreviewing(null);
      router.refresh();
    } catch {
      alert("Failed to unpublish");
    } finally {
      setActing(null);
    }
  }

  const guardFlags = (post: Post): string[] =>
    (post.metadata?.guard_flags as string[]) || [];

  const hasEditorialImages = (post: Post): boolean =>
    Array.isArray(post.metadata?.editorial_images) && (post.metadata.editorial_images as unknown[]).length > 0;

  // Build prose HTML with all images clickable for editing
  function buildProseHtml(body: string): string {
    const html = markdownToHtml(body);
    return html.replace(
      /<img ([^>]*)>/g,
      '<img $1 data-editable="true" style="cursor:pointer;border:2px solid transparent;border-radius:8px;" onmouseover="this.style.borderColor=\'var(--accent)\'" onmouseout="this.style.borderColor=\'transparent\'">'
    );
  }

  async function handleHeroEdit() {
    if (!previewing || !repromptNote.trim()) return;
    setReprompting(true);
    try {
      let referenceUrl: string | undefined;
      if (referenceFile) {
        const siteMatch = (previewing.og_image_url || "").match(/sites\/([^/]+)/);
        const sid = siteMatch?.[1] || "";
        if (sid) referenceUrl = (await uploadReference(referenceFile, sid)) || undefined;
      }

      const res = await fetch("/api/blog/reprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: previewing.id,
          image_url: previewing.og_image_url,
          adjustment: repromptNote.trim(),
          mode: repromptMode,
          reference_url: referenceUrl,
          is_hero: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewing({ ...previewing, og_image_url: data.new_url });
        setRepromptUrl(null);
        setRepromptNote("");
        setReferenceFile(null);
        setReferencePreview(null);
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.error || "Edit failed");
      }
    } catch { alert("Edit failed"); }
    finally { setReprompting(false); }
  }

  async function handleHeroReplace() {
    if (!previewing || !referenceFile) return;
    setReprompting(true);
    try {
      const siteMatch = (previewing.og_image_url || "").match(/sites\/([^/]+)/);
      const sid = siteMatch?.[1] || "";
      if (!sid) { alert("Could not determine site"); return; }

      const newUrl = await uploadReference(referenceFile, sid);
      if (!newUrl) { alert("Upload failed"); return; }

      await fetch("/api/blog/reprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: previewing.id,
          image_url: previewing.og_image_url,
          adjustment: "direct_replace",
          mode: "replace",
          reference_url: newUrl,
          is_hero: true,
        }),
      });
      setPreviewing({ ...previewing, og_image_url: newUrl });
      setRepromptUrl(null);
      setRepromptNote("");
      setReferenceFile(null);
      setReferencePreview(null);
      router.refresh();
    } catch { alert("Replace failed"); }
    finally { setReprompting(false); }
  }

  function handleReferenceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFile(file);
    setReferencePreview(URL.createObjectURL(file));
  }

  async function uploadReference(file: File, siteId: string): Promise<string | null> {
    try {
      // Get presign URL
      const contentType = file.type || (file.name.toLowerCase().endsWith(".heic") ? "image/heic" : "image/jpeg");
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, content_type: contentType, filename: file.name }),
      });
      if (!presignRes.ok) return null;
      const { upload_url, public_url } = await presignRes.json();

      // Upload to R2
      await fetch(upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });

      // Register as media asset
      await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, storage_url: public_url, media_type: "image" }),
      });

      return public_url;
    } catch {
      return null;
    }
  }

  async function handleReplace() {
    if (!previewing || !repromptUrl || !referenceFile) return;
    setReprompting(true);
    try {
      const siteMatch = repromptUrl.match(/sites\/([^/]+)/);
      const siteId = siteMatch?.[1] || "";
      if (!siteId) { alert("Could not determine site"); return; }

      const newUrl = await uploadReference(referenceFile, siteId);
      if (!newUrl) { alert("Upload failed"); return; }

      // Swap URL in post body via API
      const res = await fetch("/api/blog/reprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: previewing.id,
          image_url: repromptUrl,
          adjustment: "direct_replace",
          mode: "replace",
          reference_url: newUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (previewing.body) {
          setPreviewing({ ...previewing, body: previewing.body.replace(repromptUrl, data.new_url) });
        }
        setRepromptUrl(null);
        setRepromptNote("");
        setReferenceFile(null);
        setReferencePreview(null);
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.error || "Replace failed");
      }
    } catch { alert("Replace failed"); }
    finally { setReprompting(false); }
  }

  async function handleReprompt() {
    if (!previewing || !repromptUrl) return;
    if (!repromptNote.trim() && !referenceFile && repromptMode !== "new") return;
    setReprompting(true);
    try {
      // Upload reference image if provided
      let referenceUrl: string | undefined;
      if (referenceFile) {
        // Get siteId from a published post's image URL or from the posts data
        const siteMatch = repromptUrl.match(/sites\/([^/]+)/);
        const siteId = siteMatch?.[1] || "";
        if (siteId) {
          referenceUrl = (await uploadReference(referenceFile, siteId)) || undefined;
        }
      }

      const res = await fetch("/api/blog/reprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: previewing.id,
          image_url: repromptUrl,
          adjustment: repromptNote.trim(),
          mode: repromptMode,
          reference_url: referenceUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update the previewing post body with the new URL
        if (previewing.body) {
          setPreviewing({
            ...previewing,
            body: previewing.body.replace(repromptUrl, data.new_url),
          });
        }
        setRepromptUrl(null);
        setRepromptNote("");
        setReferenceFile(null);
        setReferencePreview(null);
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.error || "Re-prompt failed");
      }
    } catch {
      alert("Re-prompt failed");
    } finally {
      setReprompting(false);
    }
  }

  return (
    <>
      {/* Filter bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "draft", "published", "flagged"] as const).map((s) => {
            const count = s === "all" ? counts.total : counts[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => updateParams({ status: s })}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "bg-surface-hover text-muted hover:text-foreground"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {count > 0 && (
                  <span className={`ml-1.5 ${active ? "text-white/70" : "text-muted"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <select
          value={sortOrder}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="bg-surface-hover px-3 py-1.5 text-xs text-muted"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>

      {/* Post list */}
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">
            {statusFilter === "all"
              ? "No blog posts yet. Posts generate automatically as you upload content."
              : `No ${statusFilter} posts.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const flags = guardFlags(post);
            return (
              <button
                key={post.id}
                onClick={() => { setPreviewing(post); setRepromptUrl(null); setRepromptNote(""); }}
                className="flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/30"
              >
                {post.og_image_url && (
                  <img
                    src={post.og_image_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{post.title}</p>
                  {post.excerpt && (
                    <p className="mt-0.5 truncate text-xs text-muted">{post.excerpt}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[post.status] || statusStyles.draft}`}>
                      {post.status}
                    </span>
                    {post.content_type && (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                        {post.content_type.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="text-[10px] text-muted">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                    {/* Guard indicator */}
                    {post.status === "flagged" ? (
                      <span className="text-[10px] text-danger">
                        {flags.length} {flags.length === 1 ? "issue" : "issues"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-success">passed</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted">Review →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => updateParams({ page: String(currentPage - 1) })}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-xs text-muted">
            Page {currentPage} of {totalPages} ({totalCount} posts)
          </span>
          <button
            onClick={() => updateParams({ page: String(currentPage + 1) })}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* Preview panel */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8"
          onClick={() => setPreviewing(null)}
        >
          <div
            className="w-full max-w-3xl rounded-lg border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[previewing.status] || statusStyles.draft}`}>
                  {previewing.status}
                </span>
                {previewing.content_type && (
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">
                    {previewing.content_type.replace(/_/g, " ")}
                  </span>
                )}
                {previewing.status === "flagged" ? (
                  <span className="text-xs text-danger">
                    {guardFlags(previewing).length} {guardFlags(previewing).length === 1 ? "issue" : "issues"} found
                  </span>
                ) : (
                  <span className="text-xs text-success">Content guard: passed</span>
                )}
              </div>
              <button onClick={() => setPreviewing(null)} className="text-muted hover:text-foreground">✕</button>
            </div>

            {/* Guard flags */}
            {previewing.status === "flagged" && guardFlags(previewing).length > 0 ? (
              <div className="border-b border-border bg-danger/5 px-6 py-3">
                <p className="mb-1 text-xs font-medium text-danger">Content issues detected:</p>
                {guardFlags(previewing).map((flag, i) => (
                  <p key={i} className="text-xs text-danger/80">— {flag}</p>
                ))}
              </div>
            ) : null}

            {/* Video preview */}
            {previewing.metadata?.video_url && (
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">Video</span>
                  <span className="text-[10px] text-muted">9:16 vertical · social platforms + blog hero</span>
                </div>
                <video
                  src={previewing.metadata.video_url as string}
                  controls
                  className="mx-auto rounded-lg"
                  style={{ maxHeight: 300, maxWidth: 170 }}
                />
              </div>
            )}

            {/* Article preview */}
            <div className="px-6 py-6">
              <style dangerouslySetInnerHTML={{ __html: blogProseStyles }} />

              {previewing.og_image_url && (
                <div className="mb-6">
                  <img
                    src={previewing.og_image_url}
                    alt=""
                    className="w-full rounded-lg object-cover cursor-pointer"
                    style={{ maxHeight: 300, border: repromptUrl === previewing.og_image_url ? "2px solid var(--accent)" : "2px solid transparent" }}
                    onClick={() => { setRepromptUrl(previewing.og_image_url!); setRepromptNote(""); setRepromptMode("edit"); }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.borderColor = "var(--accent)"}
                    onMouseLeave={(e) => {
                      if (repromptUrl !== previewing.og_image_url) (e.target as HTMLElement).style.borderColor = "transparent";
                    }}
                  />
                  {repromptUrl === previewing.og_image_url && (
                    <div className="mt-2 rounded border border-accent/30 bg-accent/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium">Adjust hero image</p>
                        <div className="flex rounded bg-surface-hover text-[10px]">
                          <button
                            onClick={() => setRepromptMode("edit")}
                            className={`px-2.5 py-1 rounded-l ${repromptMode === "edit" ? "bg-accent text-white" : "text-muted"}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setRepromptMode("new")}
                            className={`px-2.5 py-1 ${repromptMode === "new" ? "bg-accent text-white" : "text-muted"}`}
                          >
                            New
                          </button>
                          <button
                            onClick={() => setRepromptMode("replace")}
                            className={`px-2.5 py-1 rounded-r ${repromptMode === "replace" ? "bg-accent text-white" : "text-muted"}`}
                          >
                            Replace
                          </button>
                        </div>
                      </div>
                      <p className="mb-2 text-[10px] text-muted">
                        {repromptMode === "edit"
                          ? "Make one change at a time."
                          : repromptMode === "new"
                          ? "Generate a new hero image."
                          : "Upload your own hero image."}
                      </p>
                      {referencePreview && (
                        <div className="mb-2 flex items-center gap-2">
                          <img src={referencePreview} alt="Reference" className="h-12 w-12 rounded object-cover" />
                          <span className="text-[10px] text-muted">{repromptMode === "replace" ? "Will replace hero" : "Reference"}</span>
                          <button onClick={() => { setReferenceFile(null); setReferencePreview(null); }} className="text-[10px] text-muted hover:text-danger">✕</button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {repromptMode !== "replace" && (
                          <input
                            value={repromptNote}
                            onChange={(e) => setRepromptNote(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleHeroEdit()}
                            className="flex-1 text-sm"
                            placeholder={repromptMode === "edit" ? "e.g., brighter, warmer tones" : "e.g., luxury kitchen at golden hour"}
                            autoFocus
                          />
                        )}
                        <label className="flex cursor-pointer items-center rounded bg-surface-hover px-2 py-1.5 text-[10px] text-muted hover:text-foreground">
                          <input type="file" accept="image/*" className="hidden" onChange={handleReferenceFile} />
                          {referenceFile ? "Change" : repromptMode === "replace" ? "Choose image" : "Ref"}
                        </label>
                        {repromptMode === "replace" ? (
                          <button
                            onClick={handleHeroReplace}
                            disabled={reprompting || !referenceFile}
                            className="bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                          >
                            {reprompting ? "Replacing..." : "Replace"}
                          </button>
                        ) : (
                          <button
                            onClick={handleHeroEdit}
                            disabled={reprompting || !repromptNote.trim()}
                            className="bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                          >
                            {reprompting ? "Working..." : repromptMode === "edit" ? "Edit" : "Generate"}
                          </button>
                        )}
                        <button
                          onClick={() => { setRepromptUrl(null); setRepromptNote(""); setReferenceFile(null); setReferencePreview(null); }}
                          className="px-2 py-1.5 text-xs text-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <h1 className="mb-2 text-xl font-semibold">{previewing.title}</h1>

              {previewing.excerpt && (
                <p className="mb-6 text-sm italic text-muted">{previewing.excerpt}</p>
              )}

              {previewing.body && (() => {
                const html = buildProseHtml(previewing.body);

                // If an editorial image is selected, split HTML and inject form
                if (repromptUrl) {
                  // Find the img tag with this URL and split after it
                  const imgPattern = `<img [^>]*src="${repromptUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`;
                  const match = html.match(new RegExp(imgPattern));
                  if (match && match.index !== undefined) {
                    const splitAt = match.index + match[0].length;
                    const before = html.slice(0, splitAt);
                    const after = html.slice(splitAt);
                    return (
                      <>
                        <div
                          className="preview-prose"
                          onClick={(e) => {
                            const img = (e.target as HTMLElement).closest("img[data-editable]") as HTMLImageElement | null;
                            if (img) { setRepromptUrl(img.src); setRepromptNote(""); setRepromptMode("edit"); }
                          }}
                          dangerouslySetInnerHTML={{ __html: before }}
                        />
                        <div className="my-3 rounded border border-accent/30 bg-accent/5 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-medium">Adjust this image</p>
                            <div className="flex rounded bg-surface-hover text-[10px]">
                              <button
                                onClick={() => setRepromptMode("edit")}
                                className={`px-2.5 py-1 rounded-l ${repromptMode === "edit" ? "bg-accent text-white" : "text-muted"}`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setRepromptMode("new")}
                                className={`px-2.5 py-1 ${repromptMode === "new" ? "bg-accent text-white" : "text-muted"}`}
                              >
                                New
                              </button>
                              <button
                                onClick={() => setRepromptMode("replace")}
                                className={`px-2.5 py-1 rounded-r ${repromptMode === "replace" ? "bg-accent text-white" : "text-muted"}`}
                              >
                                Replace
                              </button>
                            </div>
                          </div>
                          <p className="mb-2 text-[10px] text-muted">
                            {repromptMode === "edit"
                              ? "Make one change at a time: remove something, change a color, adjust a detail. For bigger changes, switch to New."
                              : repromptMode === "new"
                              ? "Describe the scene you want. This replaces the image entirely. Factual corrections here (e.g., spray paint not brush) will apply to future articles."
                              : "Upload your own image to swap in directly. No AI processing — your photo goes in as-is."}
                          </p>
                          {/* Reference/Replace image preview */}
                          {referencePreview && (
                            <div className="mb-2 flex items-center gap-2">
                              <img src={referencePreview} alt="Reference" className="h-12 w-12 rounded object-cover" />
                              <span className="text-[10px] text-muted">{repromptMode === "replace" ? "Will replace current image" : "Reference image"}</span>
                              <button
                                onClick={() => { setReferenceFile(null); setReferencePreview(null); }}
                                className="text-[10px] text-muted hover:text-danger"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                          <div className="flex gap-2">
                            {repromptMode !== "replace" && (
                              <input
                                value={repromptNote}
                                onChange={(e) => setRepromptNote(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleReprompt()}
                                className="flex-1 text-sm"
                                placeholder={referenceFile
                                  ? "e.g., make it look like the reference image"
                                  : repromptMode === "edit"
                                  ? "e.g., change sign to Mitchel & Mitchel, remove person on left"
                                  : "e.g., spray paint line not brush, woman making tile"}
                                autoFocus
                              />
                            )}
                            <label className="flex cursor-pointer items-center rounded bg-surface-hover px-2 py-1.5 text-[10px] text-muted hover:text-foreground">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleReferenceFile}
                              />
                              {referenceFile ? "Change" : repromptMode === "replace" ? "Choose image" : "Ref"}
                            </label>
                            {repromptMode === "replace" ? (
                              <button
                                onClick={handleReplace}
                                disabled={reprompting || !referenceFile}
                                className="bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                              >
                                {reprompting ? "Replacing..." : "Replace"}
                              </button>
                            ) : (
                              <button
                                onClick={handleReprompt}
                                disabled={reprompting || (!repromptNote.trim() && repromptMode !== "new")}
                                className="bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                              >
                                {reprompting ? (repromptMode === "edit" ? "Editing..." : "Generating...") : (repromptMode === "edit" ? "Edit" : "Regenerate")}
                              </button>
                            )}
                            <button
                              onClick={() => { setRepromptUrl(null); setRepromptNote(""); setReferenceFile(null); setReferencePreview(null); }}
                              className="px-2 py-1.5 text-xs text-muted hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <div
                          className="preview-prose"
                          onClick={(e) => {
                            const img = (e.target as HTMLElement).closest("img[data-editable]") as HTMLImageElement | null;
                            if (img) { setRepromptUrl(img.src); setRepromptNote(""); setRepromptMode("edit"); }
                          }}
                          dangerouslySetInnerHTML={{ __html: after }}
                        />
                      </>
                    );
                  }
                }

                // Default: no image selected, render full body with click detection
                return (
                  <div
                    className="preview-prose"
                    onClick={(e) => {
                      const img = (e.target as HTMLElement).closest("img[data-editable]") as HTMLImageElement | null;
                      if (img) { setRepromptUrl(img.src); setRepromptNote(""); setRepromptMode("edit"); }
                    }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              })()}
            </div>

            {/* SEO metadata preview */}
            <div className="border-t border-border px-6 py-4">
              <p className="mb-2 text-[10px] font-medium text-muted">SEO Preview</p>
              <p className="text-sm text-accent">{previewing.title}</p>
              <p className="text-xs text-success">{`blog.tracpost.com/.../` + previewing.slug}</p>
              <p className="mt-0.5 text-xs text-muted">{previewing.excerpt?.slice(0, 155)}</p>
            </div>

            {/* Review actions */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <button
                onClick={() => rejectPost(previewing.id)}
                disabled={acting === previewing.id}
                className="px-4 py-2 text-xs text-danger hover:underline disabled:opacity-50"
              >
                Delete
              </button>
              <div className="flex gap-2">
                {previewing.status === "published" ? (
                  <button
                    onClick={() => unpublishPost(previewing.id)}
                    disabled={acting === previewing.id}
                    className="rounded border border-border px-4 py-2 text-xs text-muted hover:text-foreground disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    onClick={() => approvePost(previewing.id)}
                    disabled={acting === previewing.id}
                    className="rounded bg-success px-4 py-2 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                  >
                    {acting === previewing.id ? "Publishing..." : "Approve & Publish"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
