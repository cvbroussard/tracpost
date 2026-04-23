"use client";

import { useState, useEffect } from "react";

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
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

export function AlertRibbon() {
  const [timeFilter, setTimeFilter] = useState("today");
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [hoveredEvent, setHoveredEvent] = useState<AlertEvent | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // TODO: fetch from /api/manage/alerts?range=today
    // Placeholder — will wire to real data
  }, [timeFilter]);

  const categoryY: Record<string, number> = {};
  CATEGORIES.forEach((cat, i) => {
    categoryY[cat.key] = 20 + i * 32;
  });

  return (
    <div className="ribbon-wrap">
      {/* Time filter */}
      <div className="ribbon-controls">
        <span className="ribbon-title">Mission Control</span>
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

      {/* Timeline graph area */}
      <div className="ribbon-graph">
        <svg width="100%" height="180" className="ribbon-svg">
          {/* Category lines */}
          {CATEGORIES.map(cat => (
            <g key={cat.key}>
              <line
                x1="0" x2="100%"
                y1={categoryY[cat.key]} y2={categoryY[cat.key]}
                stroke={cat.color}
                strokeOpacity={0.15}
                strokeWidth={1}
              />
              <text
                x={8}
                y={categoryY[cat.key] - 6}
                fill={cat.color}
                fontSize={9}
                fontWeight={500}
                opacity={0.6}
              >
                {cat.label}
              </text>
            </g>
          ))}

          {/* Alert dots — will be populated from real data */}
          {events.map(evt => {
            const y = categoryY[evt.category] || 100;
            const time = new Date(evt.timestamp).getTime();
            // TODO: calculate x from time range
            const x = Math.random() * 90 + 5; // placeholder
            const dotColor = CATEGORIES.find(c => c.key === evt.category)?.color || "#94a3b8";
            const dotRadius = evt.severity === "danger" ? 5 : evt.severity === "warning" ? 4 : 3;

            return (
              <circle
                key={evt.id}
                cx={`${x}%`}
                cy={y}
                r={dotRadius}
                fill={dotColor}
                opacity={0.8}
                className="ribbon-dot"
                onMouseEnter={(e) => {
                  setHoveredEvent(evt);
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredEvent(null)}
              />
            );
          })}

          {events.length === 0 && (
            <text x="50%" y="90" textAnchor="middle" fill="#6b7280" fontSize={12} opacity={0.5}>
              No alerts for this period
            </text>
          )}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hoveredEvent && (
        <div
          className="ribbon-tooltip"
          style={{ left: mousePos.x + 12, top: mousePos.y - 20 }}
        >
          <p className="ribbon-tooltip-title">{hoveredEvent.title}</p>
          <p className="ribbon-tooltip-detail">{hoveredEvent.detail}</p>
          <a href={hoveredEvent.href} className="ribbon-tooltip-link">View →</a>
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
  .ribbon-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted);
  }
  .ribbon-filters { display: flex; gap: 4px; }
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
    padding: 0 16px 8px;
    position: relative;
  }
  .ribbon-svg { display: block; }

  .ribbon-dot {
    cursor: pointer;
    transition: r 0.15s;
  }
  .ribbon-dot:hover { r: 7; }

  .ribbon-tooltip {
    position: fixed;
    z-index: 100;
    background: #1a1a1a;
    color: #fff;
    border-radius: 8px;
    padding: 10px 14px;
    max-width: 260px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
  }
  .ribbon-tooltip-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .ribbon-tooltip-detail {
    font-size: 11px;
    color: #94a3b8;
    margin-bottom: 6px;
    line-height: 1.4;
  }
  .ribbon-tooltip-link {
    font-size: 11px;
    color: #3b82f6;
    text-decoration: none;
  }
`;
