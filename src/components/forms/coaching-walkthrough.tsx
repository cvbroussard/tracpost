"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  PlatformWalkthrough,
  WalkthroughNode,
  CoachingProgressPayload,
} from "@/lib/onboarding/coaching/types";
import { ThinProgressBar } from "./thin-progress-bar";

interface LightboxImage {
  url: string;
  alt: string;
}

interface Props {
  /** Onboarding token (used to authorize API calls) */
  token: string;
  /** Platform key (meta, gbp, etc.) */
  platform: string;
  /** Friendly platform label for confirmation copy (e.g., "Facebook & Instagram") */
  platformLabel?: string;
  /** Pre-loaded walkthrough — if not provided, the modal fetches on open */
  walkthrough?: PlatformWalkthrough;
  /** Pre-loaded progress (resume support) */
  progress?: CoachingProgressPayload | null;
  /** Open/closed state, controlled by parent */
  open: boolean;
  /** Called when user closes the modal (clicks X or backdrop) */
  onClose: () => void;
  /** Called when user reaches and clicks the terminal Connect button.
   *  Parent handles the actual OAuth navigation. */
  onConnect?: () => void;
  /** Called when user explicitly marks this platform as unavailable.
   *  Parent updates state and typically closes the modal. */
  onSkip?: () => void;
}

export function CoachingWalkthrough({
  token,
  platform,
  platformLabel,
  walkthrough: walkthroughProp,
  progress: progressProp,
  open,
  onClose,
  onConnect,
  onSkip,
}: Props) {
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const [walkthrough, setWalkthrough] = useState<PlatformWalkthrough | null>(walkthroughProp || null);
  const [navStack, setNavStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentNodeId = navStack[navStack.length - 1];
  const currentNode: WalkthroughNode | null = currentNodeId && walkthrough
    ? walkthrough.nodes[currentNodeId] || null
    : null;

  // Compute progress percent from stack depth
  const totalNodes = walkthrough ? Object.keys(walkthrough.nodes).length : 1;
  const percent = useMemo(() => {
    if (!currentNode || !walkthrough) return 0;
    if (currentNode.type === "terminal") return 100;
    // Use stack depth as a heuristic, capped at 90% pre-terminal
    return Math.min(90, Math.round((navStack.length / Math.max(totalNodes - 1, 1)) * 90));
  }, [currentNode, walkthrough, navStack.length, totalNodes]);

  // Load walkthrough + progress when modal opens.
  // Tracks initialization per (open, token, platform) session to prevent
  // re-running on parent re-renders — which previously reset navStack to
  // a single entry and wiped the user's back history mid-walkthrough.
  const initSessionRef = useRef<string>("");
  useEffect(() => {
    if (!open) {
      initSessionRef.current = "";
      return;
    }
    const sessionKey = `${token}::${platform}`;
    if (initSessionRef.current === sessionKey) {
      // Already initialized for this open session; don't reset navStack
      return;
    }
    initSessionRef.current = sessionKey;

    // Restore full navigation history from path_taken (the DB audit trail
    // of every forward step). This preserves the resume bookmark behavior
    // (user lands at their last position) AND keeps Back navigation
    // working — they can walk back through the actual choices that led
    // them there. Falls back to [start] if no prior session.
    if (walkthroughProp) {
      setWalkthrough(walkthroughProp);
      const restored = restoreNavStack(walkthroughProp, progressProp?.path_taken);
      setNavStack(restored);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/onboarding/${token}/coaching/${platform}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((data) => {
        const w = data.walkthrough as PlatformWalkthrough;
        setWalkthrough(w);
        const pathTaken = data.progress?.path_taken as string[] | undefined;
        const restored = restoreNavStack(w, pathTaken);
        setNavStack(restored);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load coaching"))
      .finally(() => setLoading(false));
    // walkthroughProp and progressProp are intentionally excluded — they
    // are initialization-only props read on first session-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, platform]);

  // Persist progress when current node changes
  const recordProgress = useCallback(
    async (nodeId: string, action: "navigate" | "complete" | "abandon" = "navigate") => {
      try {
        await fetch(`/api/onboarding/${token}/coaching/${platform}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node_id: nodeId, action }),
        });
      } catch {
        /* non-fatal — progress is a nice-to-have */
      }
    },
    [token, platform]
  );

  const goNext = useCallback(
    (nextId: string) => {
      setNavStack((prev) => [...prev, nextId]);
      recordProgress(nextId, "navigate");
    },
    [recordProgress]
  );

  const goBack = useCallback(() => {
    setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const handleConnect = useCallback(() => {
    if (currentNodeId) recordProgress(currentNodeId, "complete");
    onConnect?.();
    onClose();
  }, [currentNodeId, recordProgress, onConnect, onClose]);

  const handleClose = useCallback(() => {
    if (currentNodeId) recordProgress(currentNodeId, "abandon");
    onClose();
  }, [currentNodeId, recordProgress, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={walkthrough?.title || "Connection guide"}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.30)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Thin progress bar */}
        {walkthrough && <ThinProgressBar percent={percent} position="inline" />}

        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "16px 20px 14px",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.14, margin: 0, textTransform: "uppercase" }}>
              Setup guide
            </p>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "2px 0 0" }}>
              {walkthrough?.title || "Loading…"}
            </h2>
            {walkthrough?.estimated_time && (
              <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
                {walkthrough.estimated_time}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px 16px", background: "#fafafa" }}>
          {loading && <div style={{ color: "#6b7280", fontSize: 14 }}>Loading guide…</div>}
          {error && (
            <div style={{ color: "#c53030", fontSize: 14, padding: "8px 10px", background: "rgba(229,62,62,0.06)", borderRadius: 8 }}>
              {error}
            </div>
          )}
          {currentNode && (
            <NodeRenderer
              node={currentNode}
              onAdvance={goNext}
              onConnect={handleConnect}
              onDone={onClose}
              onOpenScreenshot={(url, alt) => setLightbox({ url, alt })}
            />
          )}
        </div>

        {/* Footer nav */}
        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid #f3f4f6",
            background: "#fff",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {(() => {
            const canGoBack = navStack.length > 1;
            const prevNodeId = canGoBack ? navStack[navStack.length - 2] : null;
            const prevNode = prevNodeId && walkthrough ? walkthrough.nodes[prevNodeId] : null;
            const prevLabel = prevNode ? getNodeBackLabel(prevNode) : "";
            return (
              <button
                type="button"
                onClick={goBack}
                disabled={!canGoBack}
                style={{
                  background: "transparent",
                  border: "none",
                  color: canGoBack ? "#374151" : "#d1d5db",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "6px 0",
                  cursor: canGoBack ? "pointer" : "not-allowed",
                  textAlign: "left",
                  maxWidth: "60%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  lineHeight: 1.3,
                }}
              >
                <span style={{ fontSize: 11, color: canGoBack ? "#9ca3af" : "#d1d5db", fontWeight: 500 }}>
                  ← Back to
                </span>
                {canGoBack && prevLabel && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#1a1a1a",
                      fontWeight: 500,
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >
                    {prevLabel}
                  </span>
                )}
              </button>
            );
          })()}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {onSkip && (
              <button
                type="button"
                onClick={() => setConfirmingSkip(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  fontSize: 12,
                  padding: "6px 0",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Mark unavailable
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#6b7280",
                fontSize: 12,
                padding: "6px 0",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Close guide
            </button>
          </div>
        </footer>

        {/* Lightbox overlay for screenshots */}
        {lightbox && (
          <ScreenshotLightbox
            url={lightbox.url}
            alt={lightbox.alt}
            onClose={() => setLightbox(null)}
          />
        )}

        {/* Skip confirmation overlay */}
        {confirmingSkip && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.96)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              zIndex: 1,
            }}
            onClick={() => setConfirmingSkip(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 400,
                width: "100%",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "22px 24px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                textAlign: "center",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
                Mark {platformLabel || "this platform"} as unavailable?
              </h3>
              <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 18px", lineHeight: 1.55 }}>
                Your operator will follow up to handle this platform during provisioning. You can come back and connect it later from your dashboard.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => setConfirmingSkip(false)}
                  style={{
                    padding: "9px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    background: "transparent",
                    color: "#374151",
                    border: "1px solid #e5e7eb",
                    borderRadius: 999,
                    cursor: "pointer",
                  }}
                >
                  Keep going
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentNodeId) recordProgress(currentNodeId, "abandon");
                    onSkip?.();
                  }}
                  style={{
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#1a1a1a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 999,
                    cursor: "pointer",
                  }}
                >
                  Yes, mark unavailable
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeRenderer({
  node,
  onAdvance,
  onConnect,
  onDone,
  onOpenScreenshot,
}: {
  node: WalkthroughNode;
  onAdvance: (nextId: string) => void;
  onConnect: () => void;
  onDone: () => void;
  onOpenScreenshot: (url: string, alt: string) => void;
}) {
  if (node.type === "question") {
    return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px", lineHeight: 1.35 }}>
          {node.question}
        </h3>
        {node.help && (
          <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 18px", lineHeight: 1.55 }}>
            {node.help}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
          {node.options.map((opt) => (
            <button
              key={opt.next + opt.label}
              type="button"
              onClick={() => onAdvance(opt.next)}
              style={{
                textAlign: "left",
                padding: "12px 16px",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                color: "#1a1a1a",
                transition: "border-color 120ms, background 120ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#1a1a1a";
                e.currentTarget.style.background = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.background = "#fff";
              }}
            >
              {opt.label}
              {opt.hint && (
                <span style={{ display: "block", fontSize: 12, color: "#6b7280", fontWeight: 400, marginTop: 3 }}>
                  {opt.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "instruction") {
    return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px", lineHeight: 1.35 }}>
          {node.title}
        </h3>
        <p style={{ fontSize: 14, color: "#374151", margin: "0 0 14px", lineHeight: 1.6 }}>
          {node.body}
        </p>
        {node.bullets && node.bullets.length > 0 && (
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, color: "#4b5563", fontSize: 13, lineHeight: 1.65 }}>
            {node.bullets.map((b, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{b}</li>
            ))}
          </ul>
        )}
        {node.screenshot && (
          <div
            style={{
              margin: "14px 0",
              padding: "14px 16px",
              border: "1px dashed #d1d5db",
              borderRadius: 10,
              background: "#f9fafb",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>
              📷
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => onOpenScreenshot(node.screenshot!, node.screenshot_alt || node.title)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1d4ed8",
                  cursor: "pointer",
                  textDecoration: "underline",
                  display: "block",
                  textAlign: "left",
                }}
              >
                View screenshot
              </button>
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  marginTop: 3,
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                  wordBreak: "break-all",
                }}
              >
                {node.screenshot}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {node.deep_link && (
            <a
              href={node.deep_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "10px 18px",
                background: "#fff",
                color: "#1a1a1a",
                border: "1px solid #1a1a1a",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {node.deep_link_label || "Open in new tab"} ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => onAdvance(node.next)}
            style={{
              padding: "10px 22px",
              background: "#1a1a1a",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            I&apos;m done with this step →
          </button>
        </div>
      </div>
    );
  }

  // terminal
  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
        {node.title}
      </h3>
      <p style={{ fontSize: 14, color: "#374151", margin: "0 0 22px", lineHeight: 1.6 }}>
        {node.body}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button
          type="button"
          onClick={node.action === "connect" ? onConnect : onDone}
          style={{
            padding: "11px 26px",
            background: node.action === "connect" ? "var(--color-accent, #1d4ed8)" : "#1a1a1a",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {node.action_label || (node.action === "connect" ? "Connect" : "Done")}
        </button>
      </div>
    </div>
  );
}

/**
 * Reconstruct a navigation stack from path_taken (the DB audit trail).
 *
 * path_taken is chronological: every forward step gets appended; back-
 * navigation isn't recorded. So if a session goes A→B→C→back→D, the
 * audit log is [A, B, C, D]. Naively treating that as the navStack
 * would put C "behind" D in back-history even though C is on an
 * abandoned branch.
 *
 * Algorithm: walk path_taken backwards from the last entry, prepending
 * only nodes that are an actual graph-parent (forward-edge predecessor)
 * of the running target. That reconstructs the LINEAR path from start
 * to current, naturally dropping abandoned branches.
 */
function restoreNavStack(
  walkthrough: PlatformWalkthrough,
  pathTaken: string[] | undefined
): string[] {
  if (!pathTaken || pathTaken.length === 0) {
    return [walkthrough.start];
  }
  const valid = pathTaken.filter((id) => walkthrough.nodes[id]);
  if (valid.length === 0) {
    return [walkthrough.start];
  }

  const current = valid[valid.length - 1];
  const result: string[] = [current];
  let target = current;

  for (let i = valid.length - 2; i >= 0; i--) {
    const candidate = valid[i];
    if (isGraphParent(walkthrough, candidate, target)) {
      result.unshift(candidate);
      target = candidate;
    }
  }

  // Anchor at the walkthrough start so Back can always reach the very beginning
  if (result[0] !== walkthrough.start) {
    return [walkthrough.start, ...result];
  }
  return result;
}

/** Whether `parentId` has a forward edge directly to `childId` in the graph. */
function isGraphParent(
  w: PlatformWalkthrough,
  parentId: string,
  childId: string
): boolean {
  const node = w.nodes[parentId];
  if (!node) return false;
  if (node.type === "question") return node.options.some((o) => o.next === childId);
  if (node.type === "instruction") return node.next === childId;
  return false; // terminal nodes have no children
}

/**
 * Short, human-readable label for a node — used in the "Back to..."
 * breadcrumb. Truncates question text since questions can be long;
 * instruction + terminal nodes already have concise titles.
 */
function getNodeBackLabel(node: WalkthroughNode): string {
  const MAX = 50;
  const truncate = (s: string) => (s.length > MAX ? s.slice(0, MAX - 1).trimEnd() + "…" : s);
  if (node.type === "question") return truncate(node.question);
  if (node.type === "instruction") return truncate(node.title);
  return truncate(node.title);
}

function ScreenshotLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  const [errored, setErrored] = useState(false);
  const filePath = `public${url}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
        padding: 24,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 600,
          width: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close screenshot"
          style={{
            position: "absolute",
            top: -14,
            right: -14,
            width: 32,
            height: 32,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 999,
            color: "#1a1a1a",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.20)",
            zIndex: 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {!errored ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={alt}
            onError={() => setErrored(true)}
            style={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              borderRadius: 8,
              background: "#fff",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
          />
        ) : (
          <div
            style={{
              padding: "32px 28px",
              background: "#fff",
              borderRadius: 14,
              maxWidth: 460,
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.40)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden>
              📷
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
              Screenshot pending
            </h3>
            <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 16px", lineHeight: 1.55 }}>
              This screenshot hasn&apos;t been captured yet. Capture this screen during your next setup walkthrough and upload it to:
            </p>
            <code
              style={{
                display: "block",
                padding: "10px 14px",
                background: "#f3f4f6",
                color: "#1a1a1a",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "ui-monospace, 'SF Mono', monospace",
                wordBreak: "break-all",
                textAlign: "left",
                lineHeight: 1.6,
              }}
            >
              {filePath}
            </code>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "14px 0 0" }}>
              Once dropped into the repo at this exact path, the wizard renders the real image
              automatically — no code change needed.
            </p>
          </div>
        )}

        {!errored && (
          <p
            style={{
              fontSize: 12,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              color: "rgba(255,255,255,0.6)",
              margin: 0,
              textAlign: "center",
              wordBreak: "break-all",
            }}
          >
            {url}
          </p>
        )}
      </div>
    </div>
  );
}
