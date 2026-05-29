/** Media Production › Video — Phase-1 nav scaffold placeholder (temporary; replaced as functionality ports in). */
export default function MediaProductionVideoPage() {
  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-base font-semibold">Media Production · Video</h1>
        <p className="text-xs text-muted mt-1">
          Phase-1 nav scaffold. Functionality porting from existing routes is
          pending — the old routes stay live until each port lands.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted mb-2">Stages</div>
        <ul className="text-[13px] space-y-1.5">
          <li><span className="font-medium">Camera / Director</span> <span className="text-muted">— ports from /ops/motion-gen</span></li>
          <li><span className="font-medium">Audio overlay</span> <span className="text-muted">— not yet built (task #80)</span></li>
          <li><span className="font-medium">Effects</span> <span className="text-muted">— not yet built</span></li>
          <li><span className="font-medium">Review</span> <span className="text-muted">— finished-video QC</span></li>
        </ul>
      </div>
    </div>
  );
}
