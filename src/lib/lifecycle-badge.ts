/**
 * Processing-stage badge — the canonical status chip for an asset, shared by
 * the subscriber media grid and the manager asset-library grid so the two
 * cannot drift.
 *
 * Reads media_assets.processing_stage directly: that column IS the clean
 * state machine (uploaded → onboarded → briefed → analyzed, + failed). The
 * badge names the stage the asset has COMPLETED — stage-completion framing,
 * not "next step needed": an un-briefed asset reads "onboarded" (it IS
 * onboarded), not "needs brief." Colour progresses early → done so the grid
 * stays scannable. The returned className carries colour only — callers add
 * their own size / position classes.
 */
export function lifecycleBadge(
  processingStage: string,
): { label: string; className: string } {
  switch (processingStage) {
    case "analyzed":
      return { label: "analyzed", className: "bg-success/70 text-white" };
    case "briefed":
      return { label: "briefed", className: "bg-accent/70 text-white" };
    case "failed":
      return { label: "failed", className: "bg-red-500/80 text-white" };
    case "uploaded":
      return { label: "uploaded", className: "bg-slate-500/70 text-white" };
    case "onboarded":
    default:
      return { label: "onboarded", className: "bg-amber-500/80 text-white" };
  }
}
