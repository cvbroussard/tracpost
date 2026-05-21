/** Media Production › Analysis — Phase-1 nav scaffold placeholder (temporary; replaced as functionality ports in). */
export default function MediaProductionAnalysisPage() {
  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-base font-semibold">Media Production · Analysis</h1>
        <p className="text-xs text-muted mt-1">
          The shared trunk — the analyzed briefed asset feeds every branch.
          Provenance (real / synthetic) detection happens here. Phase-1 nav
          scaffold; functionality porting is pending.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted mb-2">Ports from</div>
        <ul className="text-[13px] space-y-1.5">
          <li><span className="font-medium">/manage/media</span> <span className="text-muted">— asset-library monitor</span></li>
          <li><span className="font-medium">Auto-tag inspector</span> <span className="text-muted">— currently in the subscriber asset modal</span></li>
        </ul>
      </div>
    </div>
  );
}
