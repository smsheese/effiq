"use client";

import * as React from "react";
import type { ScoredVariant } from "@/lib/schema";
import { getModelParent, type ParentInfo } from "@/lib/parents";

interface Props {
  rows: ScoredVariant[];
  xKey: "effiq" | "taskCost" | "latency" | "throughput";
  yKey: "effiq" | "domain" | "taskCost" | "latency" | "throughput" | "cursorbench";
  title: string;
  size?: "wide" | "compact";
}

interface Point {
  s: ScoredVariant;
  x: number;
  y: number;
  parent: ParentInfo;
}

interface CandidateOffset {
  name: string;
  dx: number;
  dy: number;
  anchor: "middle" | "start" | "end";
  connector?: boolean;
}

interface LabelBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const INITIAL_VIEWPORT: Viewport = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

const CANDIDATE_OFFSETS: CandidateOffset[] = [
  { name: "top", dx: 0, dy: -8, anchor: "middle" },
  { name: "bottom", dx: 0, dy: 14, anchor: "middle" },
  { name: "top-right", dx: 8, dy: -4, anchor: "start" },
  { name: "top-left", dx: -8, dy: -4, anchor: "end" },
  { name: "bottom-right", dx: 8, dy: 12, anchor: "start" },
  { name: "bottom-left", dx: -8, dy: 12, anchor: "end" },
  { name: "top-far", dx: 0, dy: -18, anchor: "middle", connector: true },
  { name: "bottom-far", dx: 0, dy: 23, anchor: "middle", connector: true },
];

function getLabelBounds(
  text: string,
  x: number,
  y: number,
  anchor: CandidateOffset["anchor"],
): LabelBounds {
  const width = Math.max(18, text.length * 4.4);
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { left, right: left + width, top: y - 8, bottom: y + 2 };
}

function boundsOverlap(a: LabelBounds, b: LabelBounds, gap = 2): boolean {
  return !(
    a.right + gap < b.left ||
    a.left - gap > b.right ||
    a.bottom + gap < b.top ||
    a.top - gap > b.bottom
  );
}

function higherIsBetter(key: Props["xKey"] | Props["yKey"]): boolean {
  return key !== "taskCost" && key !== "latency";
}

function getParetoFrontier(
  points: Point[],
  xKey: Props["xKey"],
  yKey: Props["yKey"],
): Point[] {
  const preferHigherX = higherIsBetter(xKey);
  const preferHigherY = higherIsBetter(yKey);
  const frontier = points.filter((point, pointIndex) => {
    return !points.some((other, otherIndex) => {
      if (pointIndex === otherIndex) return false;
      const xNoWorse = preferHigherX ? other.x >= point.x : other.x <= point.x;
      const yNoWorse = preferHigherY ? other.y >= point.y : other.y <= point.y;
      const xBetter = preferHigherX ? other.x > point.x : other.x < point.x;
      const yBetter = preferHigherY ? other.y > point.y : other.y < point.y;
      return xNoWorse && yNoWorse && (xBetter || yBetter);
    });
  });

  const seen = new Set<string>();
  return frontier
    .sort((a, b) => a.x - b.x)
    .filter((point) => {
      const key = `${point.x}:${point.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getLatencyMs(s: ScoredVariant): number | null {
  return (
    s.variant.metrics.latencyMs?.value ??
    (s.variant.metrics.ttftSeconds?.value != null
      ? s.variant.metrics.ttftSeconds.value * 1000
      : null)
  );
}

function getX(s: ScoredVariant, key: Props["xKey"]): number | null {
  if (key === "effiq") return s.efficiencyScore;
  if (key === "taskCost") {
    const val = s.effectiveTaskCostUsd;
    return val != null && val > 0 ? val : null;
  }
  const val =
    key === "latency" ? getLatencyMs(s) : (s.variant.metrics.throughputTps?.value ?? null);
  return val != null && val > 0 ? val : null;
}

function getY(s: ScoredVariant, key: Props["yKey"]): number | null {
  if (key === "effiq") return s.efficiencyScore;
  if (key === "domain") return s.domainScore;
  if (key === "taskCost") return s.effectiveTaskCostUsd;
  if (key === "latency") return getLatencyMs(s);
  if (key === "cursorbench") return s.variant.metrics.cursorBench?.value ?? null;
  return s.variant.metrics.throughputTps?.value ?? null;
}

function generateLinearTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push(min + (i / (count - 1)) * (max - min));
  }
  return ticks;
}

function generateLogTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min) {
    return [min];
  }
  const ratio = max / min;
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push(min * ratio ** (i / (count - 1)));
  }
  return ticks;
}

function shouldUseLogY(values: number[]): boolean {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length < 3 || sorted.length !== values.length) return false;
  const max = sorted[sorted.length - 1];
  const firstQuartile = sorted[Math.floor((sorted.length - 1) * 0.25)];
  return max / sorted[0] >= 20 && max / firstQuartile >= 8;
}

function zoomRange(
  min: number,
  max: number,
  focus: number,
  scale: number,
): [number, number] {
  const span = max - min;
  const nextSpan = Math.max(1 / 12, Math.min(1, span * scale));
  if (nextSpan >= 0.999) return [0, 1];

  const focusPosition = span > 0 ? (focus - min) / span : 0.5;
  let nextMin = focus - focusPosition * nextSpan;
  let nextMax = nextMin + nextSpan;
  if (nextMin < 0) {
    nextMax -= nextMin;
    nextMin = 0;
  }
  if (nextMax > 1) {
    nextMin -= nextMax - 1;
    nextMax = 1;
  }
  return [Math.max(0, nextMin), Math.min(1, nextMax)];
}

function fmtMoneyScatter(val: number): string {
  if (val === 0) return "$0";
  const v = Math.round(val * 1e6) / 1e6;
  if (v < 0.0001) return `$${v.toFixed(6).replace(/0+$/, "")}`;
  if (v < 0.001) return `$${v.toFixed(5).replace(/0+$/, "")}`;
  if (v < 0.01) return `$${v.toFixed(4).replace(/0+$/, "")}`;
  if (v < 1) {
    const s = v.toFixed(3);
    return s.endsWith("0") ? `$${v.toFixed(2)}` : `$${s}`;
  }
  return `$${v.toFixed(2)}`;
}

function fmtPricePerMillion(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (val < 0.01) return `$${val.toFixed(4).replace(/0+$/, "")}/M`;
  if (val < 1) return `$${val.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}/M`;
  return `$${val.toFixed(2).replace(/\.?0+$/, "")}/M`;
}

function fmtX(val: number, key: Props["xKey"]): string {
  if (key === "effiq") return Math.round(val).toString();
  if (key === "taskCost") {
    return fmtMoneyScatter(val);
  }
  if (key === "throughput") return Math.round(val).toString();
  // latency
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}s`;
  return `${Math.round(val)}ms`;
}

function fmtY(val: number, key: Props["yKey"]): string {
  if (key === "taskCost") return fmtMoneyScatter(val);
  if (key === "latency") {
    if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}s`;
    return `${Math.round(val)}ms`;
  }
  if (key === "effiq" || key === "domain") {
    return Math.round(val).toString();
  }
  return `${Math.round(val)}`;
}

function shortenName(name: string): string {
  const clean = name.replace(/\s*\([^)]*\)/g, "").trim();
  if (clean.length <= 13) return clean;
  return `${clean.slice(0, 12)}…`;
}

export function ParetoScatter({ rows, xKey, yKey, title, size = "wide" }: Props) {
  const [hovered, setHovered] = React.useState<Point | null>(null);
  const [titleOverflow, setTitleOverflow] = React.useState(0);
  const [viewport, setViewport] = React.useState<Viewport>(INITIAL_VIEWPORT);
  const tooltipTitleRef = React.useRef<HTMLSpanElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const pointLimit = size === "compact" ? 50 : 80;

  React.useEffect(() => {
    setViewport(INITIAL_VIEWPORT);
  }, [xKey, yKey]);

  React.useLayoutEffect(() => {
    setTitleOverflow(0);
    const frame = window.requestAnimationFrame(() => {
      const titleElement = tooltipTitleRef.current;
      if (!titleElement) return;
      setTitleOverflow(Math.max(0, titleElement.scrollWidth - titleElement.clientWidth));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hovered?.s.variant.canonicalId]);

  const pts: Point[] = React.useMemo(() => {
    return rows
      .map((s) => {
        const x = getX(s, xKey);
        const y = getY(s, yKey);
        if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const parent = getModelParent(s.variant);
        return { s, x, y, parent };
      })
      .filter((p): p is Point => p != null)
      .sort(
        (a, b) =>
          (b.s.efficiencyScore ?? Number.NEGATIVE_INFINITY) -
          (a.s.efficiencyScore ?? Number.NEGATIVE_INFINITY),
      )
      .slice(0, pointLimit);
  }, [rows, xKey, yKey, pointLimit]);

  const activeParents = React.useMemo(() => {
    const map = new Map<string, ParentInfo>();
    for (const p of pts) {
      if (!map.has(p.parent.id)) {
        map.set(p.parent.id, p.parent);
      }
    }
    return Array.from(map.values());
  }, [pts]);

  const w = size === "compact" ? 620 : 980;
  const h = size === "compact" ? 360 : 340;
  const padLeft = 56;
  const padRight = 36;
  const padTop = 24;
  const padBottom = 34;

  const fullMaxX = Math.max(1, ...pts.map((p) => p.x));
  const yValues = pts.map((p) => p.y);
  const rawMinY = yValues.length ? Math.min(...yValues) : 0;
  const rawMaxY = yValues.length ? Math.max(...yValues) : 1;
  const logarithmicY = shouldUseLogY(yValues);
  const linearPadding = Math.max(
    (rawMaxY - rawMinY) * 0.08,
    Math.abs(rawMaxY) * 0.02,
    0.01,
  );
  const baseMinY = logarithmicY
    ? Math.max(Number.EPSILON, rawMinY * 0.8)
    : Math.max(0, rawMinY - linearPadding);
  const baseMaxY = logarithmicY
    ? Math.max(baseMinY * 1.01, rawMaxY * 1.1)
    : Math.max(baseMinY + 0.01, rawMaxY + linearPadding);
  const baseLogMinY = Math.log(baseMinY);
  const baseLogMaxY = Math.log(baseMaxY);
  const domainMinX = fullMaxX * viewport.xMin;
  const domainMaxX = fullMaxX * viewport.xMax;
  const yValueAtViewportRatio = (ratio: number) =>
    logarithmicY
      ? Math.exp(baseLogMinY + ratio * (baseLogMaxY - baseLogMinY))
      : baseMinY + ratio * (baseMaxY - baseMinY);
  const domainMinY = yValueAtViewportRatio(viewport.yMin);
  const domainMaxY = yValueAtViewportRatio(viewport.yMax);
  const visiblePts = React.useMemo(
    () =>
      pts.filter(
        (point) =>
          point.x >= domainMinX &&
          point.x <= domainMaxX &&
          point.y >= domainMinY &&
          point.y <= domainMaxY,
      ),
    [pts, domainMinX, domainMaxX, domainMinY, domainMaxY],
  );
  const paretoFrontier = React.useMemo(
    () => getParetoFrontier(visiblePts, xKey, yKey),
    [visiblePts, xKey, yKey],
  );

  const sx = React.useCallback(
    (x: number) => {
      const ratio = (x - domainMinX) / (domainMaxX - domainMinX || 1);
      return padLeft + ratio * (w - padLeft - padRight);
    },
    [domainMinX, domainMaxX, padLeft, padRight, w],
  );

  const sy = React.useCallback(
    (y: number) => {
      const ratio = logarithmicY
        ? (Math.log(Math.max(y, domainMinY)) - Math.log(domainMinY)) /
          (Math.log(domainMaxY) - Math.log(domainMinY) || 1)
        : (y - domainMinY) / (domainMaxY - domainMinY || 1);
      return h - padBottom - ratio * (h - padTop - padBottom);
    },
    [logarithmicY, domainMinY, domainMaxY, h, padBottom, padTop],
  );

  const handleWheel = React.useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const bounds = svg.getBoundingClientRect();
      const svgX = ((event.clientX - bounds.left) / bounds.width) * w;
      const svgY = ((event.clientY - bounds.top) / bounds.height) * h;
      const xPosition = Math.max(
        0,
        Math.min(1, (svgX - padLeft) / (w - padLeft - padRight)),
      );
      const yPosition = Math.max(
        0,
        Math.min(1, 1 - (svgY - padTop) / (h - padTop - padBottom)),
      );
      const scale = event.deltaY < 0 ? 0.82 : 1 / 0.82;

      setHovered(null);
      setViewport((current) => {
        const xFocus = current.xMin + xPosition * (current.xMax - current.xMin);
        const yFocus = current.yMin + yPosition * (current.yMax - current.yMin);
        const [xMin, xMax] = zoomRange(
          current.xMin,
          current.xMax,
          xFocus,
          scale,
        );
        const [yMin, yMax] = zoomRange(
          current.yMin,
          current.yMax,
          yFocus,
          scale,
        );
        return { xMin, xMax, yMin, yMax };
      });
    },
    [w, h, padLeft, padRight, padTop, padBottom],
  );

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Collision-aware label placement to keep labels separated and readable
  const placedLabels = React.useMemo(() => {
    if (visiblePts.length < 1) return [];
    const placed: Array<
      Point & {
        cx: number;
        cy: number;
        lx: number;
        ly: number;
        anchor: "middle" | "start" | "end";
        connector?: boolean;
        showLabel: boolean;
        labelBounds?: LabelBounds;
      }
    > = [];

    for (let i = 0; i < visiblePts.length; i++) {
      const p = visiblePts[i];
      const cx = sx(p.x);
      const cy = sy(p.y);
      const label = shortenName(p.s.variant.displayName);

      let bestCand: CandidateOffset | null = null;
      let bestBounds: LabelBounds | undefined;
      let bestScore = -Infinity;

      for (const cand of CANDIDATE_OFFSETS) {
        const lx = cx + cand.dx;
        const ly = cy + cand.dy;
        const bounds = getLabelBounds(label, lx, ly, cand.anchor);

        if (
          bounds.left < padLeft ||
          bounds.right > w - padRight ||
          bounds.top < padTop ||
          bounds.bottom > h - padBottom
        ) {
          continue;
        }

        const overlapsLabel = placed.some(
          (placedLabel) =>
            placedLabel.showLabel &&
            placedLabel.labelBounds != null &&
            boundsOverlap(bounds, placedLabel.labelBounds),
        );
        if (overlapsLabel) continue;

        const coversAnotherDot = visiblePts.some((other, otherIndex) => {
          if (otherIndex === i) return false;
          const otherX = sx(other.x);
          const otherY = sy(other.y);
          return (
            otherX >= bounds.left - 3 &&
            otherX <= bounds.right + 3 &&
            otherY >= bounds.top - 3 &&
            otherY <= bounds.bottom + 3
          );
        });
        if (coversAnotherDot) continue;

        let minDistSq = Infinity;
        for (const pl of placed) {
          if (!pl.showLabel) continue;
          const d2 = (lx - pl.lx) ** 2 + (ly - pl.ly) ** 2;
          if (d2 < minDistSq) minDistSq = d2;
        }
        for (let j = 0; j < visiblePts.length; j++) {
          if (i === j) continue;
          const otherCx = sx(visiblePts[j].x);
          const otherCy = sy(visiblePts[j].y);
          const d2 = (lx - otherCx) ** 2 + (ly - otherCy) ** 2;
          if (d2 < minDistSq) minDistSq = d2;
        }

        // Slight natural preference for top or bottom positions if not crowded
        const bias = cand.name === "top" ? 350 : cand.name === "bottom" ? 150 : 0;
        const score = minDistSq + bias;
        if (score > bestScore) {
          bestScore = score;
          bestCand = cand;
          bestBounds = bounds;
        }
      }

      const chosen = bestCand ?? CANDIDATE_OFFSETS[0];
      placed.push({
        ...p,
        cx,
        cy,
        lx: cx + chosen.dx,
        ly: cy + chosen.dy,
        anchor: chosen.anchor,
        connector: chosen.connector,
        showLabel: bestCand != null,
        labelBounds: bestBounds,
      });
    }

    return placed;
  }, [visiblePts, sx, sy, padLeft, padRight, padTop, padBottom, w, h]);

  if (pts.length < 2) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Not enough points for {title}.
      </div>
    );
  }

  const tickCount = size === "compact" ? 5 : 7;
  const xTicks = generateLinearTicks(domainMinX, domainMaxX, tickCount);
  const yTicks = logarithmicY
    ? generateLogTicks(domainMinY, domainMaxY, 5)
    : generateLinearTicks(domainMinY, domainMaxY, 5);
  const yScaleLabel = logarithmicY ? "adaptive log scale" : "focused linear scale";
  const zoomed =
    viewport.xMin > 0 ||
    viewport.xMax < 1 ||
    viewport.yMin > 0 ||
    viewport.yMax < 1;

  const yLabel =
    yKey === "effiq"
      ? `Effiq Score (0–100, ${yScaleLabel}) ↑`
      : yKey === "domain"
        ? `Domain score (0–100, ${yScaleLabel}) ↑`
        : yKey === "taskCost"
          ? `Task cost ($ USD, ${yScaleLabel}) ↓`
          : yKey === "latency"
            ? `Latency (ms / s, ${yScaleLabel}) ↓`
            : yKey === "cursorbench"
              ? `CursorBench 3.2 score (%, ${yScaleLabel}) ↑`
              : `Throughput (tokens/sec, ${yScaleLabel}) ↑`;
  const xLabel =
    xKey === "effiq"
      ? "Effiq Score (0–100, linear scale) →"
      : xKey === "taskCost"
        ? "Task cost ($ USD, linear scale) →"
        : xKey === "latency"
          ? "Latency (ms / s, linear scale) →"
          : "Throughput (tokens/sec, linear scale) →";

  // Coordinates for hovered point speech bubble
  const hoveredX = hovered ? sx(hovered.x) : 0;
  const hoveredY = hovered ? sy(hovered.y) : 0;
  const leftPct = (hoveredX / w) * 100;
  const topPct = (hoveredY / h) * 100;
  const flipDown = topPct < 32;

  return (
    <div className="relative w-full rounded-xl border bg-card p-4 shadow-xs">
      {/* Title & Legend */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        {/* Parent color legend */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[10px] text-muted-foreground">
            Ctrl + scroll to zoom
          </span>
          {zoomed && (
            <button
              type="button"
              className="pointer-events-auto rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
              onClick={() => {
                setHovered(null);
                setViewport(INITIAL_VIEWPORT);
              }}
            >
              Reset zoom
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                className="text-primary"
              />
            </svg>
            <span>Pareto frontier</span>
          </span>
          {activeParents.map((parent) => (
            <span
              key={parent.id}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                className="size-2 rounded-full inline-block shrink-0"
                style={{ backgroundColor: parent.color }}
              />
              <span>{parent.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top Left Y-axis label with units */}
      <div className="mb-1 text-left">
        <span className="text-[11px] font-medium text-foreground">{yLabel}</span>
      </div>

      {/* Chart container */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Y Axis Grid lines and markings */}
          {yTicks.map((tickVal, idx) => {
            const yPos = sy(tickVal);
            return (
              <g key={`ytick-${idx}`}>
                <line
                  x1={padLeft}
                  y1={yPos}
                  x2={w - padRight}
                  y2={yPos}
                  stroke="currentColor"
                  strokeDasharray="2 3"
                  opacity={0.12}
                />
                <line
                  x1={padLeft - 4}
                  y1={yPos}
                  x2={padLeft}
                  y2={yPos}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <text
                  x={padLeft - 7}
                  y={yPos + 3.5}
                  textAnchor="end"
                  fontSize="9"
                  fill="currentColor"
                  opacity={0.65}
                  className="font-mono tabular-nums"
                >
                  {fmtY(tickVal, yKey)}
                </text>
              </g>
            );
          })}

          {/* X Axis grid lines and ranked-value markings */}
          {xTicks.map((tickVal, idx) => {
            const xPos = sx(tickVal);
            return (
              <g key={`xtick-${idx}`}>
                <line
                  x1={xPos}
                  y1={padTop}
                  x2={xPos}
                  y2={h - padBottom}
                  stroke="currentColor"
                  strokeDasharray="2 3"
                  opacity={0.12}
                />
                <line
                  x1={xPos}
                  y1={h - padBottom}
                  x2={xPos}
                  y2={h - padBottom + 4}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <text
                  x={xPos}
                  y={h - padBottom + 14}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="currentColor"
                  opacity={0.65}
                  className="font-mono tabular-nums"
                >
                  {fmtX(tickVal, xKey)}
                </text>
              </g>
            );
          })}

          {/* Main Axis Borders */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={h - padBottom}
            stroke="currentColor"
            opacity={0.3}
          />
          <line
            x1={padLeft}
            y1={h - padBottom}
            x2={w - padRight}
            y2={h - padBottom}
            stroke="currentColor"
            opacity={0.3}
          />

          {/* Dotted Pareto frontier connecting non-dominated models */}
          {paretoFrontier.length > 1 && (
            <polyline
              points={paretoFrontier.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.55}
              className="pointer-events-none text-primary"
            />
          )}

          {/* Data Points and Staggered Model Names */}
          {placedLabels.map((p) => {
            const isHovered = hovered?.s.variant.canonicalId === p.s.variant.canonicalId;

            return (
              <g
                key={p.s.variant.canonicalId}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Hairline connector line if label is placed farther away */}
                {p.showLabel && p.connector && (
                  <line
                    x1={p.cx}
                    y1={p.cy}
                    x2={p.lx}
                    y2={p.ly}
                    stroke="currentColor"
                    strokeDasharray="1 1.5"
                    opacity={0.2}
                    className="pointer-events-none"
                  />
                )}

                {/* Model name offset around dot with collision avoidance */}
                {p.showLabel && (
                  <text
                    x={p.lx}
                    y={p.ly}
                    textAnchor={p.anchor}
                    fontSize={isHovered ? "8.5" : "7.5"}
                    fill="currentColor"
                    opacity={isHovered ? 1 : 0.65}
                    style={{
                      paintOrder: "stroke",
                      stroke: "var(--background)",
                      strokeWidth: "2.5px",
                      strokeLinejoin: "round",
                    }}
                    className={`pointer-events-none select-none font-sans ${
                      isHovered ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {shortenName(p.s.variant.displayName)}
                  </text>
                )}

                {/* Static Dot */}
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={isHovered ? 5 : 3.5}
                  fill={p.parent.color}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 1.8 : 0.8}
                  opacity={isHovered ? 1 : 0.85}
                />
              </g>
            );
          })}

          {/* Highlighted hovered point rendered on top */}
          {hovered && (
            <g className="pointer-events-none">
              <circle
                cx={sx(hovered.x)}
                cy={sy(hovered.y)}
                r={5.5}
                fill={hovered.parent.color}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* Interactive Speech Bubble with Details */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-40 w-72 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md transition-all duration-100 ease-out"
            style={{
              left: `${Math.max(12, Math.min(88, leftPct))}%`,
              top: `${topPct}%`,
              transform: flipDown
                ? "translate(-50%, 14px)"
                : "translate(-50%, -100%) translateY(-12px)",
            }}
          >
            {/* Arrow */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 size-0 border-x-4 border-x-transparent ${
                flipDown
                  ? "-top-1.5 border-b-4 border-b-popover"
                  : "-bottom-1.5 border-t-4 border-t-popover"
              }`}
            />

            {/* Bubble Header */}
            <div className="flex items-center gap-1.5 border-b border-border/60 pb-1.5 mb-1.5">
              <span
                className="size-2 rounded-full shrink-0 inline-block"
                style={{ backgroundColor: hovered.parent.color }}
              />
              <span className="min-w-0 flex-1 overflow-hidden">
                <span
                  ref={tooltipTitleRef}
                  className={`block whitespace-nowrap font-semibold text-[11px] leading-none ${
                    titleOverflow > 0 ? "effiq-tooltip-marquee" : ""
                  }`}
                  style={
                    titleOverflow > 0
                      ? ({
                          "--marquee-distance": `${titleOverflow}px`,
                          "--marquee-duration": `${Math.max(5, 3 + titleOverflow / 18)}s`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  title={hovered.s.variant.displayName}
                >
                  {hovered.s.variant.displayName}
                </span>
              </span>
            </div>

            {/* Metrics Breakdown */}
            <div className="space-y-1 font-mono text-[10px] leading-tight">
              <div className="flex justify-between text-muted-foreground">
                <span>Parent:</span>
                <span className="font-medium text-foreground">{hovered.parent.label}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Task Cost:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {hovered.s.effectiveTaskCostUsd != null
                    ? fmtMoneyScatter(hovered.s.effectiveTaskCostUsd)
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 whitespace-nowrap border-y border-border/40 py-1 text-[9px] text-muted-foreground">
                <span>
                  Input{" "}
                  <span className="font-medium text-foreground">
                    {fmtPricePerMillion(hovered.s.variant.metrics.inputUsdPerMillion?.value)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-border">|</span>
                <span>
                  Output{" "}
                  <span className="font-medium text-foreground">
                    {fmtPricePerMillion(hovered.s.variant.metrics.outputUsdPerMillion?.value)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-border">|</span>
                <span>
                  Cache read{" "}
                  <span className="font-medium text-foreground">
                    {fmtPricePerMillion(hovered.s.variant.metrics.cacheReadUsdPerMillion?.value)}
                  </span>
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Domain Score:</span>
                <span className="font-medium text-primary">
                  {hovered.s.domainScore != null ? hovered.s.domainScore.toFixed(1) : "—"}
                </span>
              </div>
              {hovered.s.variant.metrics.cursorBench && (
                <div className="flex justify-between text-muted-foreground">
                  <span>CursorBench 3.2:</span>
                  <span className="font-medium text-primary">
                    {hovered.s.variant.metrics.cursorBench.value.toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Throughput:</span>
                <span className="font-medium text-foreground">
                  {hovered.s.variant.metrics.throughputTps?.value != null
                    ? `${Math.round(hovered.s.variant.metrics.throughputTps.value)} t/s`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Latency:</span>
                <span className="font-medium text-foreground">
                  {hovered.s.variant.metrics.latencyMs?.value != null
                    ? `${Math.round(hovered.s.variant.metrics.latencyMs.value)}ms`
                    : hovered.s.variant.metrics.ttftSeconds?.value != null
                    ? `${(hovered.s.variant.metrics.ttftSeconds.value * 1000).toFixed(0)}ms`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40">
                <span>Effiq Score:</span>
                <span className="font-semibold text-primary">
                  {hovered.s.efficiencyScore?.toFixed(1) ?? "—"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Right X-axis label with units */}
      <div className="mt-1 flex justify-end text-[11px] font-medium text-foreground">
        <span>{xLabel}</span>
      </div>
      <style>{`
        @keyframes effiq-tooltip-title-marquee {
          0%, 15% { transform: translateX(0); }
          70%, 85% { transform: translateX(calc(0px - var(--marquee-distance))); }
          100% { transform: translateX(0); }
        }

        .effiq-tooltip-marquee {
          animation: effiq-tooltip-title-marquee var(--marquee-duration) ease-in-out infinite;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .effiq-tooltip-marquee {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
