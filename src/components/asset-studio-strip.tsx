"use client";

import { useState } from "react";
import { toast } from "@/components/feedback";

/**
 * Asset Studio — vertical tool strip for the asset modal.
 *
 * Lives next to the asset preview. Each tool is a button. Clicking opens
 * a small inline panel below the strip with the tool's input (instruction
 * text, prompt, etc.) and a Run button.
 *
 * On success, the new asset lands in pending_briefing state. A success
 * toast surfaces with a link to navigate to the new asset for briefing.
 *
 * Per the briefing-required + AI-as-scaffolding principles:
 * - All outputs go through the standard briefing queue (pending_briefing)
 * - Tools are positioned as utility, not headline capability
 * - Operator stays out — this is subscriber-facing only
 */

type Tool =
  | "edit"
  | "enhance"
  | "regenerate"
  | "animate"
  | "generate-variation"
  | "generate-from-prompt";

interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  // Tools that don't need free-text input (Enhance, Regenerate)
  noInput?: boolean;
  // Only show on image assets (not video)
  imageOnly?: boolean;
}

const TOOL_GROUPS: Array<{ heading: string; tools: ToolDef[] }> = [
  {
    heading: "Modify this asset",
    tools: [
      {
        id: "edit",
        label: "Edit",
        hint: "Make a targeted change. Original is preserved; result lands as a sibling.",
        inputLabel: "What to change",
        inputPlaceholder: "e.g. remove person on left, change sign to Mitchel & Mitchel",
        imageOnly: true,
      },
      {
        id: "enhance",
        label: "Enhance",
        hint: "Polish exposure / color / clarity. No creative editing.",
        noInput: true,
        imageOnly: true,
      },
      {
        id: "regenerate",
        label: "Regenerate",
        hint: "Heavy-handed cleanup for low-quality photos.",
        noInput: true,
        imageOnly: true,
      },
    ],
  },
  {
    heading: "Create from this asset",
    tools: [
      {
        id: "animate",
        label: "Animate as video",
        hint: "Generate a 5-10s motion clip from this still via Kling.",
        inputLabel: "Motion description (optional)",
        inputPlaceholder: "Subtle natural motion. Gentle camera drift.",
        imageOnly: true,
      },
      {
        id: "generate-variation",
        label: "Generate variation",
        hint: "Make a new editorial-quality image inspired by this one.",
        inputLabel: "How should the variation differ",
        inputPlaceholder: "e.g. shot from above, warmer light",
        imageOnly: true,
      },
    ],
  },
  {
    heading: "Create new",
    tools: [
      {
        id: "generate-from-prompt",
        label: "Generate from prompt",
        hint: "Make a new asset from a text description. This asset is anchor only.",
        inputLabel: "Describe the image you want",
        inputPlaceholder: "Editorial photograph of a brass faucet over a marble kitchen island, natural light",
      },
    ],
  },
];

export function AssetStudioStrip({
  assetId,
  mediaType,
  onAssetCreated,
}: {
  assetId: string;
  mediaType: string;
  onAssetCreated?: (newAssetId: string) => void;
}) {
  const [openTool, setOpenTool] = useState<Tool | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ id: string; tool: Tool } | null>(null);

  const isVideo = mediaType?.startsWith("video");

  function selectTool(t: Tool) {
    setOpenTool(t);
    setInput("");
    setLastResult(null);
  }

  async function run() {
    if (!openTool) return;
    const def = findTool(openTool);
    if (!def) return;
    if (!def.noInput && def.id !== "animate" && !input.trim()) {
      toast.error("Please provide an instruction first");
      return;
    }
    setRunning(true);
    try {
      const body: Record<string, unknown> = { tool: openTool };
      if (openTool === "generate-from-prompt") {
        body.prompt = input.trim();
      } else if (!def.noInput) {
        body.instruction = input.trim() || undefined;
      }
      const res = await fetch(`/api/assets/${assetId}/studio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Studio operation failed");
        return;
      }
      setLastResult({ id: data.newAssetId, tool: openTool });
      toast.success("Asset created — needs briefing");
      onAssetCreated?.(data.newAssetId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Studio operation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-hover">
      <div className="flex">
        {/* Vertical tool strip */}
        <div className="w-44 shrink-0 border-r border-border p-2 space-y-3">
          <div className="text-[9px] uppercase tracking-wide text-muted px-1.5">
            AI Studio
          </div>
          {TOOL_GROUPS.map((group) => (
            <div key={group.heading} className="space-y-0.5">
              <div className="text-[9px] text-muted px-1.5 mb-0.5">{group.heading}</div>
              {group.tools.map((t) => {
                const disabled = t.imageOnly && isVideo;
                const active = openTool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => !disabled && selectTool(t.id)}
                    disabled={disabled}
                    className={`w-full text-left px-1.5 py-1 rounded text-[11px] transition-colors ${
                      active
                        ? "bg-accent text-white"
                        : disabled
                        ? "text-muted/40 cursor-not-allowed"
                        : "text-foreground hover:bg-surface"
                    }`}
                    title={disabled ? "Image assets only" : t.hint}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Tool panel */}
        <div className="flex-1 p-3 min-h-[140px]">
          {!openTool ? (
            <div className="text-[11px] text-muted leading-snug">
              Pick a tool from the strip. Outputs land in your library as new assets that need briefing —
              originals are always preserved.
            </div>
          ) : (
            <ToolPanel
              tool={findTool(openTool)!}
              input={input}
              onInputChange={setInput}
              onRun={run}
              onCancel={() => { setOpenTool(null); setInput(""); setLastResult(null); }}
              running={running}
              lastResult={lastResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolPanel({
  tool,
  input,
  onInputChange,
  onRun,
  onCancel,
  running,
  lastResult,
}: {
  tool: ToolDef;
  input: string;
  onInputChange: (v: string) => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
  lastResult: { id: string; tool: Tool } | null;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs font-medium">{tool.label}</div>
        <div className="text-[10px] text-muted leading-snug mt-0.5">{tool.hint}</div>
      </div>

      {!tool.noInput && (
        <div>
          <label className="block text-[10px] text-muted mb-1">{tool.inputLabel}</label>
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !running && onRun()}
            placeholder={tool.inputPlaceholder}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            autoFocus
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onRun}
          disabled={running}
          className="bg-accent px-3 py-1.5 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
        <button
          onClick={onCancel}
          disabled={running}
          className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
        {lastResult && (
          <span className="text-[10px] text-success ml-auto">
            ✓ Created — needs briefing
          </span>
        )}
      </div>
    </div>
  );
}

function findTool(id: Tool): ToolDef | undefined {
  for (const g of TOOL_GROUPS) {
    const t = g.tools.find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}
