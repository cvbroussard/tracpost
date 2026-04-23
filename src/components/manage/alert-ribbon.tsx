"use client";

import { useState, useEffect, useMemo } from "react";

interface AlertEvent {
  id: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  href: string;
  timestamp: string;
}

const CATEGORIES = [
  { key: "provisioning", label: "Provisioning", color: "#3b82f6" },
  { key: "content", label: "Content", color: "#22c55e" },
  { key: "connections", label: "Connections", color: "#f59e0b" },
  { key: "billing", label: "Billing", color: "#8b5cf6" },
  { key: "performance", label: "Performance", color: "#ef4444" },
];

const TIME_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

const SEVERITY_RADIUS: Record<string, number> = {
  danger: 6,
  warning: 5,
  info: 4,
};

export function AlertRibbon() {
  const [timeFilter, setTimeFilter] = useState("7d");
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEvent, setHoveredEvent] = useState<AlertEvent | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/alerts?range=${timeFilter}`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(data => setEvents(data.events || []))
      .finally(() => setLoading(false));
  }, [timeFilter]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (timeFilter) {
      case "yesterday": {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);
        start = y;
        break;
      }
      case "7d":
        start = new Date(now.getTime() - 7 * 86400000);
        break;
      case "30d":
        start = new Date(now.getTime() - 30 * 86400000);
        break;
      default: {
        const t = new Date(now);
        t.setHours(0, 0, 0, 0);
        start = t;
      }
    }
    return { rangeStart: start.getTime(), rangeEnd: now.getTime() };
  }, [timeFilter]);

  function xPercent(timestamp: string): number {
    const t = new Date(timestamp).getTime();
    const range = rangeEnd - rangeStart;
    if (range <= 0) return 50;
    const pct = ((t - rangeStart) / range) * 100;
    return Math.max(2, Math.min(98, pct));
  }

  const categoryY: Record<string, number> = {};
  CATEGORIES.forEach((cat, i) => {
    categoryY[cat.key] = 28 + i * 28;
  });

  const totalHeight = 28 + CATEGORIES.length * 28 + 10;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.category] = (c[e.category] || 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="ribbon-wrap">
      <div className="ribbon-controls">
        <div className="ribbon-left">
          <span className="ribbon-title">Mission Control</span>
          {!loading && events.length > 0 && (
            <span className="ribbon-count">{events.length} alert{events.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="ribbon-filters">
          {TIME_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setTimeFilter(f.value)}
              className={`ribbon-filter ${timeFilter === f.value ? "ribbon-filter-active" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ribbon-graph">
        {loading ? (
          <div style={{ height: totalHeight, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : (
          <svg width="100%" height={totalHeight} className="ribbon-svg">
            {CATEGORIES.map(cat => (
              <g key={cat.key}>
                <line
                  x1="60" x2="100%"
                  y1={categoryY[cat.key]} y2={categoryY[cat.key]}
                  stroke={cat.color}
                  strokeOpacity={0.12}
                  strokeWidth={1}
                />
                <text
                  x={4}
                  y={categoryY[cat.key] + 4}
                  fill={cat.color}
                  fontSize={9}
                  fontWeight={500}
                  opacity={counts[cat.key] ? 0.9 : 0.35}
                >
                  {cat.label}
                  {counts[cat.key] ? ` (${counts[cat.key]})` : ""}
                </text>
              </g>
            ))}

            {events.map(evt => {
              const y = categoryY[evt.category];
              if (!y) return null;
              const x = xPercent(evt.timestamp);
              const dotColor = CATEGORIES.find(c => c.key === evt.category)?.color || "#94a3b8";
              const r = SEVERITY_RADIUS[evt.severity] || 4;

              return (
                <g key={evt.id}>
                  {evt.severity === "danger" && (
                    <circle cx={`${x}%`} cy={y} r={r + 4} fill={dotColor} opacity={0.15} />
                  )}
                  <circle
                    cx={`${x}%`}
                    cy={y}
                    r={r}
                    fill={dotColor}
                    opacity={0.85}
                    className="ribbon-dot"
                    onMouseEnter={(e) => {
                      setHoveredEvent(evt);
                      setMousePos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredEvent(null)}
                    onClick={() => {
                      if (evt.href) window.location.href = evt.href;
                    }}
                  />
                </g>
              );
            })}

            {events.length === 0 && (
              <text x="50%" y={totalHeight / 2} textAnchor="middle" fill="#6b7280" fontSize={12} opacity={0.5}>
                No alerts for this period
              </text>
            )}
          </svg>
        )}
      </div>

      {hoveredEvent && (
        <div
          className="ribbon-tooltip"
          style={{ left: mousePos.x + 12, top: mousePos.y - 20 }}
        >
          <p className="ribbon-tooltip-title">{hoveredEvent.title}</p>
          <p className="ribbon-tooltip-detail">{hoveredEvent.detail}</p>
          <p className="ribbon-tooltip-time">
            {new Date(hoveredEvent.timestamp).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: ribbonStyles }} />
    </div>
  );
}

const ribbonStyles = `
  .ribbon-wrap {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .ribbon-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 0;
  }
  .ribbon-left { display: flex; align-items: center; gap: 8px; }
  .ribbon-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted);
  }
  .ribbon-count {
    font-size: 10px;
    color: var(--color-muted);
    background: var(--color-surface-hover);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .ribbon-filters { display: flex; gap: 2px; }
  .ribbon-filter {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    transition: color 0.15s;
  }
  .ribbon-filter:hover { color: var(--color-foreground); }
  .ribbon-filter-active {
    background: var(--color-surface-hover);
    color: var(--color-foreground);
    font-weight: 500;
  }

  .ribbon-graph {
    padding: 4px 16px 8px;
    position: relative;
  }
  .ribbon-svg { display: block; }

  .ribbon-dot {
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .ribbon-dot:hover { opacity: 1 !important; }

  .ribbon-tooltip {
    position: fixed;
    z-index: 100;
    background: #1a1a1a;
    color: #fff;
    border-radius: 8px;
    padding: 10px 14px;
    max-width: 280px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
  }
  .ribbon-tooltip-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 3px;
  }
  .ribbon-tooltip-detail {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
    margin-bottom: 4px;
  }
  .ribbon-tooltip-time {
    font-size: 10px;
    color: #6b7280;
  }
`;
