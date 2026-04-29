"use client";

interface Props {
  percent: number;
  position?: "top" | "inline";
}

export function ThinProgressBar({ percent, position = "top" }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const wrapStyle: React.CSSProperties =
    position === "top"
      ? { position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }
      : { position: "relative" };

  return (
    <div
      style={{
        ...wrapStyle,
        height: 2,
        background: "rgba(0,0,0,0.06)",
      }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          height: "100%",
          width: `${clamped}%`,
          background: "var(--color-accent)",
          transition: "width 280ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        }}
      />
    </div>
  );
}
