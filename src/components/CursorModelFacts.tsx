"use client";

import type { ModelVariant } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Terminal, Activity, Zap, Layers } from "lucide-react";

interface Props {
  variant: ModelVariant;
}

export function CursorModelFacts({ variant }: Props) {
  const cursorOffers = variant.offers.filter((o) => o.channel === "cursor");
  const taskSlug = variant.ids.cursorTaskSlug;
  const modelId = variant.ids.cursorModelId;
  const cb = variant.metrics.cursorBench;
  const cbCost = variant.metrics.cursorBenchCostUsd;
  const cbTokens = variant.metrics.cursorBenchTokens;
  const cbSteps = variant.metrics.cursorBenchSteps;

  return (
    <div className="space-y-3.5 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-primary" />
          <span className="font-semibold text-sm">Cursor Model Pricing & Task Slugs</span>
          <Badge variant="default" className="text-[10px]">
            Available in Cursor
          </Badge>
          {cb && (
            <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary border-primary/30">
              CursorBench 3.2
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {cb && (
            <a
              href="https://cursor.com/cursorbench"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
            >
              <span>CursorBench</span>
              <ExternalLink className="size-3" />
            </a>
          )}
          <a
            href="https://cursor.com/docs/models-and-pricing"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
          >
            <span>Pricing Docs</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {modelId && (
          <span className="rounded bg-background/80 px-2 py-0.5 font-mono text-[11px] border">
            Model ID: <span className="font-semibold">{modelId}</span>
          </span>
        )}
        {taskSlug && (
          <span className="rounded bg-background/80 px-2 py-0.5 font-mono text-[11px] border">
            Task Slug: <span className="font-semibold">{taskSlug}</span>
          </span>
        )}
      </div>

      {cb && (
        <div className="space-y-2 rounded border border-primary/25 bg-background/80 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Activity className="size-3.5 text-primary" />
              CursorBench 3.2 Benchmark Results
            </span>
            <span className="text-[11px] text-muted-foreground">
              Measured on real codebase tasks
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded bg-muted/40 p-2 text-center">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Score</div>
              <div className="text-base font-bold text-primary tabular-nums">
                {cb.value.toFixed(1)}%
              </div>
            </div>
            <div className="rounded bg-muted/40 p-2 text-center">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Cost / Task</div>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
                {cbCost ? `$${cbCost.value.toFixed(2)}` : "—"}
              </div>
            </div>
            <div className="rounded bg-muted/40 p-2 text-center">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Tokens / Task</div>
              <div className="text-base font-bold text-foreground tabular-nums font-mono">
                {cbTokens ? cbTokens.value.toLocaleString() : "—"}
              </div>
            </div>
            <div className="rounded bg-muted/40 p-2 text-center">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Steps / Task</div>
              <div className="text-base font-bold text-foreground tabular-nums font-mono">
                {cbSteps ? cbSteps.value : "—"}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Evaluated on real developer problems: instruction following, tool use, codebase understanding, bug finding, planning, and code review.
          </p>
        </div>
      )}

      <div className="space-y-1.5 pt-1">
        <div className="text-xs font-medium text-foreground">
          Cursor Published Pricing ({cursorOffers.length}{" "}
          {cursorOffers.length === 1 ? "tier" : "tiers"})
        </div>
        {cursorOffers.length > 0 ? (
          <div className="max-h-52 overflow-y-auto rounded border bg-background/70">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/80 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="px-2.5 py-1.5">Variant / Mode</th>
                  <th className="px-2.5 py-1.5 text-right">Input / 1M</th>
                  <th className="px-2.5 py-1.5 text-right">Output / 1M</th>
                  <th className="px-2.5 py-1.5 text-right">Cache Read / 1M</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono text-[11px]">
                {cursorOffers.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-2.5 py-1.5 font-sans font-medium">
                      {o.variant || "Standard"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-600 dark:text-emerald-400">
                      {o.inputUsdPerMillion != null ? `$${o.inputUsdPerMillion.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-sky-600 dark:text-sky-400">
                      {o.outputUsdPerMillion != null ? `$${o.outputUsdPerMillion.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                      {o.cacheReadUsdPerMillion != null ? `$${o.cacheReadUsdPerMillion.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Available on Cursor subscription pool.
          </div>
        )}
      </div>
    </div>
  );
}
