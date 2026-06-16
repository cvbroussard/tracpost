/**
 * Shared "CMA required" blocker — rendered by both the Categories and
 * Services tabs when the pipeline pre-check returns code='cma_required'.
 *
 * Per the manual-before-autopilot doctrine (2026-06-16): downstream
 * triggers don't auto-bootstrap CMA. Operator must explicitly run CMA
 * via Competitive Analysis first. This blocker surfaces that gate
 * with a direct deep-link to the manual trigger.
 */
"use client";

import { usePathname } from "next/navigation";

export function CmaRequiredBlocker({
  code,
  message,
}: {
  code: "no_cma" | "no_tier2";
  message: string;
}) {
  const pathname = usePathname();
  // Preserve the operator's prefix (/ops on ops.tracpost.com, no prefix on preview).
  const prefix = pathname.startsWith("/ops") ? "/ops" : "";
  const headline =
    code === "no_cma"
      ? "Competitive Market Analysis required"
      : "Competitive Market Analysis needs to be re-run";
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 shadow-card">
      <h3 className="text-sm font-medium text-warning">⚠ {headline}</h3>
      <p className="mt-2 text-[11px] leading-relaxed text-foreground">{message}</p>
      <div className="mt-3">
        <a
          href={`${prefix}/competitive-analysis`}
          className="inline-flex items-center rounded border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          Go to Competitive Analysis →
        </a>
      </div>
      <p className="mt-2 text-[10px] text-muted">
        Manual-before-autopilot: each pipeline step is triggered explicitly while we debug and
        validate. Auto-trigger may return later as an explicit autopilot capability.
      </p>
    </div>
  );
}
