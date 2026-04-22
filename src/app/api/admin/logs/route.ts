import { NextRequest, NextResponse } from "next/server";

const AXIOM_TOKEN = process.env.AXIOM_TOKEN;
const AXIOM_DATASET = process.env.AXIOM_DATASET || "vercel";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!AXIOM_TOKEN) {
    return NextResponse.json({ error: "AXIOM_TOKEN not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity") || "";
  const route = url.searchParams.get("route") || "";
  const search = url.searchParams.get("search") || "";
  const minutes = Number(url.searchParams.get("minutes")) || 60;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);

  const filters: string[] = [];

  if (route) {
    filters.push(`request.path contains "${route}"`);
  }

  if (search) {
    filters.push(`message contains "${search}"`);
  }

  const where = filters.length > 0 ? `| where ${filters.join(" and ")}` : "";
  const apl = `['${AXIOM_DATASET}'] ${where} | sort by _time desc | limit ${limit}`;

  const startTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  try {
    const res = await fetch("https://api.axiom.co/v1/datasets/_apl?format=tabular", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AXIOM_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apl,
        startTime,
        endTime: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Axiom query failed:", res.status, text);
      return NextResponse.json({ error: "Axiom query failed", detail: text }, { status: res.status });
    }

    const data = await res.json();
    const fields = data.tables?.[0]?.fields || [];
    const columns = data.tables?.[0]?.columns || [];

    const fieldIndex: Record<string, number> = {};
    fields.forEach((f: { name: string }, i: number) => { fieldIndex[f.name] = i; });

    const rowCount = columns[0]?.length || 0;
    const col = (name: string, i: number) => {
      const idx = fieldIndex[name];
      return idx !== undefined ? columns[idx]?.[i] : null;
    };

    const flat = Array.from({ length: rowCount }, (_, i) => ({
      timestamp: (col("_time", i) as string) || "",
      severity: (col("level", i) as string) || "info",
      message: (col("message", i) as string) || "",
      route: (col("request.path", i) as string) || (col("vercel.route", i) as string) || "",
      method: (col("request.method", i) as string) || "",
      statusCode: (col("request.statusCode", i) as number) || null,
      duration: (col("report.durationMs", i) as number) || null,
      source: (col("vercel.source", i) as string) || "",
      host: (col("request.host", i) as string) || "",
      region: (col("vercel.region", i) as string) || "",
      requestId: (col("request.id", i) as string) || "",
    }));

    // Group by requestId: entries with a statusCode are request-level parents,
    // everything else is a console log line that nests underneath
    const isParent = (e: typeof flat[0]) => e.statusCode !== null;
    const groups = new Map<string, { parent: typeof flat[0] | null; logs: typeof flat[0][] }>();

    for (const entry of flat) {
      if (!entry.requestId) {
        groups.set(`orphan-${groups.size}`, { parent: entry, logs: [] });
        continue;
      }
      const existing = groups.get(entry.requestId);
      if (existing) {
        if (isParent(entry) && !existing.parent) {
          existing.parent = entry;
        } else if (isParent(entry)) {
          // duplicate parent — skip
        } else {
          existing.logs.push(entry);
        }
      } else {
        if (isParent(entry)) {
          groups.set(entry.requestId, { parent: entry, logs: [] });
        } else {
          groups.set(entry.requestId, { parent: null, logs: [entry] });
        }
      }
    }

    const entries = [...groups.values()]
      .filter((g) => g.parent !== null || g.logs.length > 0)
      .map((g) => {
        // If no parent request was captured, promote the first log line
        if (!g.parent && g.logs.length > 0) {
          g.parent = g.logs.shift()!;
        }
        const worstSeverity = g.logs.some((l) => l.severity === "error") ? "error"
          : g.logs.some((l) => l.severity === "warning") ? "warning"
          : g.parent!.severity;
        return {
          ...g.parent!,
          severity: worstSeverity,
          logs: g.logs.map((l) => ({
            timestamp: l.timestamp,
            severity: l.severity,
            message: l.message,
          })),
        };
      });

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply severity filter after grouping so parent+child stay together
    const filtered = severity
      ? entries.filter((e) =>
          severity === "error"
            ? e.severity === "error" || e.severity === "warning"
            : e.severity === severity
        )
      : entries;

    return NextResponse.json({ entries: filtered, count: filtered.length });
  } catch (err) {
    console.error("Axiom request error:", err);
    return NextResponse.json({ error: "Failed to query logs" }, { status: 500 });
  }
}
