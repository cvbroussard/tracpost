"use client";

/**
 * Operator-facing editor for a single platform's coaching walkthrough.
 *
 * Layout: walkthrough header (title, subtitle, time, start) + flat grid
 * of nodes in BFS order from start. Each node row collapses to a summary
 * line and expands to a full content editor (title, body, gallery, edges,
 * etc.).
 *
 * All edits PUT immediately on Save (no auto-save) and surface success/
 * error via toast. Asset uploads go straight to R2 via presigned URL,
 * with an automatic Cloudflare cache purge.
 */
import { useMemo, useRef, useState } from "react";
import { toast, confirm } from "@/components/feedback";

type NodeType = "question" | "instruction" | "terminal";

export interface EditorWalkthrough {
  platform: string;
  title: string;
  subtitle: string | null;
  estimated_time: string | null;
  start_node_id: string;
}

export interface EditorNode {
  id: string;
  type: NodeType;
  content: Record<string, unknown>;
  position: number;
}

interface Props {
  platform: string;
  initialWalkthrough: EditorWalkthrough;
  initialNodes: EditorNode[];
  analytics: Record<string, { visits: number; lastSeen: number }>;
}

export function CoachingEditor({
  platform,
  initialWalkthrough,
  initialNodes,
  analytics,
}: Props) {
  const [walkthrough, setWalkthrough] = useState(initialWalkthrough);
  const [nodes, setNodes] = useState(initialNodes);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingMeta, setSavingMeta] = useState(false);

  const orderedNodes = useMemo(
    () => orderByGraphTraversal(walkthrough.start_node_id, nodes),
    [walkthrough.start_node_id, nodes]
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/admin/coaching/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: walkthrough.title,
          subtitle: walkthrough.subtitle,
          estimated_time: walkthrough.estimated_time,
          start_node_id: walkthrough.start_node_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Walkthrough saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingMeta(false);
    }
  }

  function handleNodeUpdated(updated: EditorNode) {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function handleNodeDeleted(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleAddNode() {
    const id = window.prompt("New node id (lowercase, underscores, e.g. q_business_page):");
    if (!id) return;
    const type = window.prompt(
      'Node type: "question", "instruction", or "terminal"',
      "instruction"
    );
    if (!type || !["question", "instruction", "terminal"].includes(type)) {
      toast.error('Type must be "question", "instruction", or "terminal"');
      return;
    }
    try {
      const res = await fetch(`/api/admin/coaching/${platform}/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      const defaultContent =
        type === "question"
          ? { question: "New question?", options: [] }
          : type === "instruction"
          ? { title: "New step", body: "", next: "" }
          : { title: "Done", body: "", action: "done" };
      setNodes((prev) => [
        ...prev,
        { id, type: type as NodeType, content: defaultContent, position: data.position },
      ]);
      setExpanded((prev) => new Set(prev).add(id));
      toast.success(`Node "${id}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  const allNodeIds = useMemo(() => nodes.map((n) => n.id).sort(), [nodes]);

  return (
    <div>
      {/* ─── Walkthrough metadata ──────────────────────────────────────── */}
      <div className="mt-4 mb-6 rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{walkthrough.title || platform}</h1>
          <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            {platform}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Title">
            <input
              type="text"
              value={walkthrough.title}
              onChange={(e) => setWalkthrough({ ...walkthrough, title: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Subtitle">
            <input
              type="text"
              value={walkthrough.subtitle ?? ""}
              onChange={(e) =>
                setWalkthrough({ ...walkthrough, subtitle: e.target.value || null })
              }
              className="input"
            />
          </Field>
          <Field label="Estimated time">
            <input
              type="text"
              value={walkthrough.estimated_time ?? ""}
              onChange={(e) =>
                setWalkthrough({ ...walkthrough, estimated_time: e.target.value || null })
              }
              className="input"
            />
          </Field>
          <Field label="Start node">
            <select
              value={walkthrough.start_node_id}
              onChange={(e) =>
                setWalkthrough({ ...walkthrough, start_node_id: e.target.value })
              }
              className="input"
            >
              {allNodeIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted">
            {nodes.length} node{nodes.length === 1 ? "" : "s"} ·{" "}
            {nodes.filter((n) => n.type === "terminal").length} terminal
          </p>
          <button
            type="button"
            onClick={saveMeta}
            disabled={savingMeta}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {savingMeta ? "Saving..." : "Save walkthrough"}
          </button>
        </div>
      </div>

      {/* ─── Node grid ────────────────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Nodes</h2>
        <button
          type="button"
          onClick={handleAddNode}
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground"
        >
          + Add node
        </button>
      </div>

      <div className="space-y-2">
        {orderedNodes.map((node, idx) => (
          <NodeRow
            key={node.id}
            stepNumber={idx + 1}
            node={node}
            isStart={node.id === walkthrough.start_node_id}
            allNodeIds={allNodeIds}
            analytics={analytics[node.id]}
            expanded={expanded.has(node.id)}
            onToggle={() => toggleExpanded(node.id)}
            platform={platform}
            onUpdated={handleNodeUpdated}
            onDeleted={handleNodeDeleted}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Node row ───────────────────────────────────────────────────────────

interface NodeRowProps {
  stepNumber: number;
  node: EditorNode;
  isStart: boolean;
  allNodeIds: string[];
  analytics?: { visits: number; lastSeen: number };
  expanded: boolean;
  onToggle: () => void;
  platform: string;
  onUpdated: (n: EditorNode) => void;
  onDeleted: (id: string) => void;
}

function NodeRow({
  stepNumber,
  node,
  isStart,
  allNodeIds,
  analytics,
  expanded,
  onToggle,
  platform,
  onUpdated,
  onDeleted,
}: NodeRowProps) {
  const [content, setContent] = useState(node.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const titlePreview = String(
    content.title || content.question || "(no title)"
  ).slice(0, 80);
  const galleryCount = Array.isArray(content.gallery) ? (content.gallery as unknown[]).length : 0;
  const hasLegacyScreenshot = !!content.screenshot;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/coaching/${platform}/nodes/${node.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onUpdated({ ...node, content });
      toast.success(`"${node.id}" saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (isStart) {
      toast.error("Cannot delete the start node — change the walkthrough's start first");
      return;
    }
    if (!(await confirm({
      title: `Delete node "${node.id}"?`,
      body: "This cannot be undone. The delete will fail if other nodes still link here.",
      danger: true,
      confirmLabel: "Delete",
    }))) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/coaching/${platform}/nodes/${node.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted(node.id);
      toast.success(`"${node.id}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
      >
        <span className="w-6 text-right text-xs font-mono text-muted">{stepNumber}</span>
        <TypeIcon type={node.type} />
        <code className="text-xs font-mono text-muted">{node.id}</code>
        {isStart && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            start
          </span>
        )}
        <span className="flex-1 truncate text-sm">{titlePreview}</span>
        {galleryCount > 0 && (
          <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
            🖼 {galleryCount}
          </span>
        )}
        {hasLegacyScreenshot && galleryCount === 0 && (
          <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
            legacy shot
          </span>
        )}
        {analytics && analytics.visits > 0 && (
          <span className="text-[10px] text-muted" title="visits / last-seen">
            {analytics.visits}v / {analytics.lastSeen}↤
          </span>
        )}
        <span className="text-xs text-muted">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-border p-4">
          {node.type === "instruction" && (
            <InstructionEditor
              platform={platform}
              nodeId={node.id}
              content={content}
              setContent={setContent}
              allNodeIds={allNodeIds}
            />
          )}
          {node.type === "question" && (
            <QuestionEditor
              content={content}
              setContent={setContent}
              allNodeIds={allNodeIds}
            />
          )}
          {node.type === "terminal" && (
            <TerminalEditor content={content} setContent={setContent} />
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <button
              type="button"
              onClick={del}
              disabled={deleting || isStart}
              className="text-xs text-danger hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {deleting ? "Deleting..." : "Delete node"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setContent(node.content);
                  toast.info("Reset to last saved");
                }}
                className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save node"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Instruction editor ─────────────────────────────────────────────────

interface ContentEditorProps {
  content: Record<string, unknown>;
  setContent: (c: Record<string, unknown>) => void;
  allNodeIds: string[];
}

function InstructionEditor({
  platform,
  nodeId,
  content,
  setContent,
  allNodeIds,
}: ContentEditorProps & { platform: string; nodeId: string }) {
  const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]) : [];
  const gallery = Array.isArray(content.gallery)
    ? (content.gallery as Array<Record<string, unknown>>)
    : [];

  function update(patch: Record<string, unknown>) {
    setContent({ ...content, ...patch });
  }

  return (
    <div className="space-y-4">
      <Field label="Title">
        <input
          type="text"
          value={String(content.title ?? "")}
          onChange={(e) => update({ title: e.target.value })}
          className="input"
        />
      </Field>
      <Field label="Body">
        <textarea
          value={String(content.body ?? "")}
          onChange={(e) => update({ body: e.target.value })}
          rows={4}
          className="input"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Deep link URL">
          <input
            type="url"
            value={String(content.deep_link ?? "")}
            onChange={(e) => update({ deep_link: e.target.value || undefined })}
            className="input"
          />
        </Field>
        <Field label="Deep link label">
          <input
            type="text"
            value={String(content.deep_link_label ?? "")}
            onChange={(e) => update({ deep_link_label: e.target.value || undefined })}
            className="input"
          />
        </Field>
      </div>
      <Field label="Bullets (one per line)">
        <textarea
          value={bullets.join("\n")}
          onChange={(e) => {
            // During typing: keep raw lines so newlines and trailing
            // spaces aren't eaten by the same-tick re-render. The
            // previous trim+filter inside onChange dropped empty lines
            // before the cursor could move to them (Enter was a no-op)
            // and stripped trailing whitespace before the next character
            // could land (Space was a no-op). Cleanup happens on blur.
            update({ bullets: e.target.value.split("\n") });
          }}
          onBlur={(e) => {
            const cleaned = e.target.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            update({ bullets: cleaned.length > 0 ? cleaned : undefined });
          }}
          rows={Math.max(3, bullets.length + 1)}
          className="input"
        />
      </Field>
      <Field label="Next node">
        <select
          value={String(content.next ?? "")}
          onChange={(e) => update({ next: e.target.value })}
          className="input"
        >
          <option value="">— select —</option>
          {allNodeIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </Field>

      <GalleryEditor
        platform={platform}
        nodeId={nodeId}
        gallery={gallery}
        onChange={(g) => update({ gallery: g.length > 0 ? g : undefined })}
      />

      {!!content.screenshot && (
        <div className="rounded border border-warning/30 bg-warning/5 p-3 text-xs">
          <p className="font-medium text-warning">Legacy single screenshot still present</p>
          <p className="mt-1 text-muted">
            <code className="font-mono">{String(content.screenshot)}</code>
          </p>
          <button
            type="button"
            onClick={() => {
              const next = { ...content };
              delete next.screenshot;
              delete next.screenshot_alt;
              setContent(next);
            }}
            className="mt-2 text-warning hover:underline"
          >
            Remove legacy screenshot fields
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Question editor ────────────────────────────────────────────────────

function QuestionEditor({ content, setContent, allNodeIds }: ContentEditorProps) {
  const options = Array.isArray(content.options)
    ? (content.options as Array<{ label?: string; next?: string; hint?: string }>)
    : [];

  function update(patch: Record<string, unknown>) {
    setContent({ ...content, ...patch });
  }

  function setOption(idx: number, patch: Partial<{ label: string; next: string; hint: string }>) {
    const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    update({ options: next });
  }

  return (
    <div className="space-y-4">
      <Field label="Question">
        <textarea
          value={String(content.question ?? "")}
          onChange={(e) => update({ question: e.target.value })}
          rows={2}
          className="input"
        />
      </Field>
      <Field label="Help text">
        <textarea
          value={String(content.help ?? "")}
          onChange={(e) => update({ help: e.target.value || undefined })}
          rows={3}
          className="input"
        />
      </Field>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Options ({options.length})
        </p>
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="rounded border border-border bg-background p-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  type="text"
                  placeholder="Button label"
                  value={opt.label ?? ""}
                  onChange={(e) => setOption(idx, { label: e.target.value })}
                  className="input"
                />
                <select
                  value={opt.next ?? ""}
                  onChange={(e) => setOption(idx, { next: e.target.value })}
                  className="input"
                >
                  <option value="">— next node —</option>
                  {allNodeIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Hint (optional fine print)"
                value={opt.hint ?? ""}
                onChange={(e) => setOption(idx, { hint: e.target.value })}
                className="input mt-2"
              />
              <button
                type="button"
                onClick={() => update({ options: options.filter((_, i) => i !== idx) })}
                className="mt-2 text-xs text-danger hover:underline"
              >
                Remove option
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update({ options: [...options, { label: "", next: "" }] })}
            className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted hover:bg-surface-hover hover:text-foreground"
          >
            + Add option
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Terminal editor ────────────────────────────────────────────────────

function TerminalEditor({
  content,
  setContent,
}: {
  content: Record<string, unknown>;
  setContent: (c: Record<string, unknown>) => void;
}) {
  function update(patch: Record<string, unknown>) {
    setContent({ ...content, ...patch });
  }
  return (
    <div className="space-y-4">
      <Field label="Title">
        <input
          type="text"
          value={String(content.title ?? "")}
          onChange={(e) => update({ title: e.target.value })}
          className="input"
        />
      </Field>
      <Field label="Body">
        <textarea
          value={String(content.body ?? "")}
          onChange={(e) => update({ body: e.target.value })}
          rows={3}
          className="input"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Action">
          <select
            value={String(content.action ?? "done")}
            onChange={(e) => update({ action: e.target.value })}
            className="input"
          >
            <option value="connect">connect (triggers OAuth)</option>
            <option value="done">done (close modal)</option>
          </select>
        </Field>
        <Field label="Action label override">
          <input
            type="text"
            value={String(content.action_label ?? "")}
            onChange={(e) => update({ action_label: e.target.value || undefined })}
            placeholder="Defaults to 'Connect'"
            className="input"
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Gallery editor ─────────────────────────────────────────────────────

interface GalleryEditorProps {
  platform: string;
  nodeId: string;
  gallery: Array<Record<string, unknown>>;
  onChange: (g: Array<Record<string, unknown>>) => void;
}

function GalleryEditor({ platform, nodeId, gallery, onChange }: GalleryEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [purging, setPurging] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      // Server-proxied upload: browser → /api/admin/coaching/upload →
      // R2. We don't go direct-to-R2 because the bucket lacks browser
      // CORS configuration; routing through our API also keeps Cloudflare
      // cache purge in the same request.
      const form = new FormData();
      form.append("platform", platform);
      form.append("nodeId", nodeId);
      form.append("file", file);

      const res = await fetch("/api/admin/coaching/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      onChange([
        ...gallery,
        { type: "image", url: data.publicUrl, caption: "", alt: "" },
      ]);
      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function purgeOne(url: string) {
    setPurging(true);
    try {
      const res = await fetch("/api/admin/coaching/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      });
      const data = await res.json();
      if (!data.success) throw new Error("Purge failed");
      toast.success("Cache purged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purge failed");
    } finally {
      setPurging(false);
    }
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function setItem(idx: number, patch: Record<string, unknown>) {
    onChange(gallery.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }

  function remove(idx: number) {
    onChange(gallery.filter((_, i) => i !== idx));
  }

  function addButton() {
    onChange([...gallery, { type: "button", label: `Step ${gallery.length + 1}`, caption: "" }]);
  }

  return (
    <div className="rounded border border-border bg-background p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Gallery ({gallery.length})
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "+ Add image"}
          </button>
          <button
            type="button"
            onClick={addButton}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-hover"
          >
            + Add button-step
          </button>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) uploadFile(file);
        }}
        className="space-y-2"
      >
        {gallery.length === 0 && (
          <div className="rounded border border-dashed border-border py-6 text-center text-xs text-muted">
            Drop an image here, or use the buttons above
          </div>
        )}
        {gallery.map((item, idx) => {
          const type = String(item.type || "");
          return (
            <div key={idx} className="flex gap-3 rounded border border-border bg-surface p-2">
              <div className="flex w-6 flex-col items-center justify-center text-xs text-muted">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="hover:text-foreground disabled:opacity-30"
                >
                  ▲
                </button>
                <span className="my-0.5 font-mono">{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === gallery.length - 1}
                  className="hover:text-foreground disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              {type === "image" ? (
                <>
                  {item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={String(item.url)}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-border bg-background text-[10px] text-muted">
                      no url
                    </div>
                  )}
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      placeholder="Caption"
                      value={String(item.caption ?? "")}
                      onChange={(e) => setItem(idx, { caption: e.target.value })}
                      className="input text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Alt text (a11y)"
                      value={String(item.alt ?? "")}
                      onChange={(e) => setItem(idx, { alt: e.target.value })}
                      className="input text-xs"
                    />
                    <input
                      type="text"
                      value={String(item.url ?? "")}
                      onChange={(e) => setItem(idx, { url: e.target.value })}
                      className="input font-mono text-[10px] text-muted"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 space-y-1">
                  <span className="inline-block rounded bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                    button-step
                  </span>
                  <input
                    type="text"
                    placeholder="Chip label (e.g. 'Wait for email')"
                    value={String(item.label ?? "")}
                    onChange={(e) => setItem(idx, { label: e.target.value })}
                    className="input text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Caption"
                    value={String(item.caption ?? "")}
                    onChange={(e) => setItem(idx, { caption: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                {type === "image" && !!item.url && (
                  <button
                    type="button"
                    onClick={() => purgeOne(String(item.url))}
                    disabled={purging}
                    className="text-[10px] text-muted hover:text-foreground disabled:opacity-50"
                    title="Purge CDN cache for this URL"
                  >
                    purge
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="text-[10px] text-danger hover:underline"
                >
                  remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function TypeIcon({ type }: { type: NodeType }) {
  const map: Record<NodeType, { ch: string; cls: string; title: string }> = {
    question: { ch: "?", cls: "bg-accent/10 text-accent", title: "Question" },
    instruction: { ch: "→", cls: "bg-success/10 text-success", title: "Instruction" },
    terminal: { ch: "■", cls: "bg-warning/10 text-warning", title: "Terminal" },
  };
  const m = map[type];
  return (
    <span
      title={m.title}
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${m.cls}`}
    >
      {m.ch}
    </span>
  );
}

/**
 * Order nodes by BFS from the start node, so the operator sees them in
 * the order a subscriber would actually traverse them. Unreachable nodes
 * (orphans) trail at the end so they're visible but not interleaved.
 */
function orderByGraphTraversal(start: string, nodes: EditorNode[]): EditorNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ordered: EditorNode[] = [];
  const visited = new Set<string>();
  const queue: string[] = [start];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    ordered.push(node);

    const c = node.content;
    if (node.type === "instruction" && typeof c.next === "string") {
      queue.push(c.next);
    } else if (node.type === "question" && Array.isArray(c.options)) {
      for (const opt of c.options as Array<{ next?: string }>) {
        if (typeof opt.next === "string") queue.push(opt.next);
      }
    }
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) ordered.push(n);
  }
  return ordered;
}
