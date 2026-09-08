import * as React from "react";
import { GitCompareArrows, X } from "lucide-react";
import type { ScoredVariant } from "@/lib/schema";
import { cn } from "@/lib/utils";

const MAX_COMPARE = 5;

type MetricDef = {
  key: string;
  label: string;
  value: (s: ScoredVariant) => number | null;
  fmt: (n: number) => string;
  /** When true the biggest value wins; when false the smallest wins. */
  higherBetter: boolean;
};

function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1e3)}k`;
  if (n >= 1000) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtPricePerM(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.001) return `$${n.toFixed(4)}`;
  if (n < 0.1) return `$${n.toFixed(3)}`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

function fmtMoney(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toFixed(6).replace(/0+$/, "")}`;
  if (n < 0.001) return `$${n.toFixed(5).replace(/0+$/, "")}`;
  if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, "")}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function latencyMs(s: ScoredVariant): number | null {
  return (
    s.variant.metrics.latencyMs?.value ??
    (s.variant.metrics.ttftSeconds?.value != null
      ? s.variant.metrics.ttftSeconds.value * 1000
      : null)
  );
}

const METRICS: MetricDef[] = [
  {
    key: "efficiency",
    label: "Effiq Score",
    value: (s) => s.efficiencyScore,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
  {
    key: "domainEfficiency",
    label: "Domain eff.",
    value: (s) => s.domainEfficiencyScore,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
  {
    key: "domain",
    label: "Domain",
    value: (s) => s.domainScore,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
  {
    key: "intelligence",
    label: "Intel",
    value: (s) => s.intelligenceForGate,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
  {
    key: "coding",
    label: "Coding",
    value: (s) => s.variant.metrics.coding?.value ?? null,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
  {
    key: "agentic",
    label: "Agentic",
    value: (s) => s.variant.metrics.agentic?.value ?? null,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
  {
    key: "cursorBench",
    label: "CursorBench",
    value: (s) => s.variant.metrics.cursorBench?.value ?? null,
    fmt: (n) => `${n.toFixed(1)}%`,
    higherBetter: true,
  },
  {
    key: "taskCost",
    label: "Task $",
    value: (s) => s.effectiveTaskCostUsd,
    fmt: fmtMoney,
    higherBetter: false,
  },
  {
    key: "taskTokens",
    label: "Tokens/task",
    value: (s) => s.variant.metrics.taskTokens?.value ?? null,
    fmt: fmtTokens,
    higherBetter: false,
  },
  {
    key: "taskTime",
    label: "Task time",
    value: (s) => s.variant.metrics.taskTimeSeconds?.value ?? null,
    fmt: (n) => `${n.toFixed(1)}s`,
    higherBetter: false,
  },
  {
    key: "throughput",
    label: "TPS",
    value: (s) => s.variant.metrics.throughputTps?.value ?? null,
    fmt: (n) => String(Math.round(n)),
    higherBetter: true,
  },
  {
    key: "latency",
    label: "Latency",
    value: latencyMs,
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`),
    higherBetter: false,
  },
  {
    key: "inputCost",
    label: "In $/1M",
    value: (s) => s.variant.metrics.inputUsdPerMillion?.value ?? null,
    fmt: fmtPricePerM,
    higherBetter: false,
  },
  {
    key: "outputCost",
    label: "Out $/1M",
    value: (s) => s.variant.metrics.outputUsdPerMillion?.value ?? null,
    fmt: fmtPricePerM,
    higherBetter: false,
  },
  {
    key: "cacheReadCost",
    label: "Cache $/1M",
    value: (s) => s.variant.metrics.cacheReadUsdPerMillion?.value ?? null,
    fmt: fmtPricePerM,
    higherBetter: false,
  },
  {
    key: "capabilityPerDollar",
    label: "Cap/$",
    value: (s) => s.capabilityPerDollar,
    fmt: (n) => n.toFixed(1),
    higherBetter: true,
  },
];

interface Props {
  open: boolean;
  rows: ScoredVariant[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Slide-over drawer comparing up to MAX_COMPARE scored variants,
 *  one column per model, one row per metric with the best value highlighted. */
export function CompareDrawer({ open, rows, onRemove, onClear, onClose }: Props) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <div className={cn("fixed inset-0 z-50", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn(
          "absolute inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Compare models"
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(960px,100vw)] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <GitCompareArrows className="size-4 text-primary" />
          <div className="text-sm font-semibold">
            Compare{" "}
            <span className="font-mono tabular-nums">
              {rows.length}/{MAX_COMPARE}
            </span>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compare"
            className={cn(
              "rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              rows.length === 0 && "ml-auto",
            )}
          >
            <X className="size-4" />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Pick models with the compare button in the table to see their differences here.
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-5">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-card pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Metric
                  </th>
                  {rows.map((s) => (
                    <th key={s.variant.canonicalId} scope="col" className="min-w-36 pb-2 pl-3 text-left align-bottom">
                      <div className="font-medium text-foreground">{s.variant.displayName}</div>
                      <div className="font-mono text-[11px] font-normal text-muted-foreground">
                        {s.variant.provider} · {s.variant.effort}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(s.variant.canonicalId)}
                        aria-label={`Remove ${s.variant.displayName} from compare`}
                        className="mt-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Remove
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const values = rows.map((s) => m.value(s));
                  const finite = values.filter(
                    (v): v is number => v != null && Number.isFinite(v),
                  );
                  const best =
                    finite.length > 0
                      ? m.higherBetter
                        ? Math.max(...finite)
                        : Math.min(...finite)
                      : null;
                  return (
                    <tr key={m.key} className="border-t border-border">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-card py-2 pr-3 text-left text-xs font-medium text-muted-foreground"
                      >
                        {m.label}
                      </th>
                      {values.map((v, i) => {
                        const isBest = best != null && v != null && Number.isFinite(v) && v === best;
                        const delta =
                          best != null &&
                          v != null &&
                          Number.isFinite(v) &&
                          v !== best &&
                          rows.length > 1
                            ? m.higherBetter
                              ? `−${m.fmt(best - v)}`
                              : `+${m.fmt(v - best)}`
                            : null;
                        return (
                          <td key={rows[i].variant.canonicalId} className="py-2 pl-3 align-top">
                            <div
                              className={cn(
                                "font-mono tabular-nums",
                                isBest ? "font-semibold text-primary" : "text-foreground",
                              )}
                            >
                              {v != null && Number.isFinite(v) ? m.fmt(v) : "—"}
                            </div>
                            {delta && !isBest && (
                              <div className="text-[11px] tabular-nums text-muted-foreground">
                                {delta} vs best
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted-foreground">
              Best value per row is highlighted; deltas show how far each model trails the best.
              Lower is better for cost, tokens, time, and latency rows.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
