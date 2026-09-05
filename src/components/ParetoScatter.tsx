"use client";

import type { ScoredVariant } from "@/lib/schema";

interface Props {
  rows: ScoredVariant[];
  xKey: "taskCost" | "latency";
  yKey: "domain" | "throughput";
  title: string;
}

function getX(s: ScoredVariant, key: Props["xKey"]): number | null {
  if (key === "taskCost") return s.effectiveTaskCostUsd;
  const lat =
    s.variant.metrics.latencyMs?.value ??
    (s.variant.metrics.ttftSeconds?.value != null
      ? s.variant.metrics.ttftSeconds.value * 1000
      : null);
  return lat;
}

function getY(s: ScoredVariant, key: Props["yKey"]): number | null {
  if (key === "domain") return s.domainScore;
  return s.variant.metrics.throughputTps?.value ?? null;
}

export function ParetoScatter({ rows, xKey, yKey, title }: Props) {
  const pts = rows
    .map((s) => {
      const x = getX(s, xKey);
      const y = getY(s, yKey);
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { s, x, y };
    })
    .filter((p): p is { s: ScoredVariant; x: number; y: number } => p != null)
    .slice(0, 80);

  if (pts.length < 2) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Not enough points for {title}.
      </div>
    );
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = 420;
  const h = 220;
  const pad = 28;

  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (w - pad * 2);
  const sy = (y: number) => h - pad - ((y - minY) / (maxY - minY || 1)) * (h - pad * 2);

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={title}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity={0.2} />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="currentColor" opacity={0.2} />
        {pts.map((p) => (
          <circle
            key={p.s.variant.canonicalId}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={3.5}
            className="fill-emerald-600 dark:fill-emerald-400"
            opacity={0.75}
          >
            <title>
              {p.s.variant.displayName}: x={p.x.toFixed(3)} y={p.y.toFixed(1)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{xKey === "taskCost" ? "Task cost →" : "Latency →"}</span>
        <span>{yKey === "domain" ? "Domain score ↑" : "Throughput ↑"}</span>
      </div>
    </div>
  );
}
