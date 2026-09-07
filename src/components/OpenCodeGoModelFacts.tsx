"use client";

import type { ModelVariant } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Zap } from "lucide-react";

interface Props {
  variant: ModelVariant;
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function OpenCodeGoModelFacts({ variant }: Props) {
  const offers = variant.offers.filter((o) => o.channel === "opencode");
  if (!offers.length) return null;
  return (
    <div className="space-y-3.5 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-2.5">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <span className="font-semibold text-sm">OpenCode Go Pricing</span>
          <Badge variant="default" className="text-[10px]">
            Available on OpenCode Go
          </Badge>
        </div>
        <a
          href="https://opencode.ai/docs/go/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
        >
          <span>Pricing Docs</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="max-h-52 overflow-y-auto rounded border bg-background/70">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted/80 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
            <tr>
              <th className="px-2.5 py-1.5">Model ID</th>
              <th className="px-2.5 py-1.5 text-right">Input / 1M</th>
              <th className="px-2.5 py-1.5 text-right">Output / 1M</th>
              <th className="px-2.5 py-1.5 text-right">Cache Read / 1M</th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono text-[11px]">
            {offers.map((o) => (
              <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-2.5 py-1.5 font-sans font-medium">{o.variant || "Standard"}</td>
                <td className="px-2.5 py-1.5 text-right text-emerald-600 dark:text-emerald-400">
                  {fmt(o.inputUsdPerMillion)}
                </td>
                <td className="px-2.5 py-1.5 text-right text-sky-600 dark:text-sky-400">
                  {fmt(o.outputUsdPerMillion)}
                </td>
                <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                  {fmt(o.cacheReadUsdPerMillion)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Published OpenCode Go prices via OpenCode Zen ($10/month plan, usage in dollars per model).
        Full list at <span className="font-mono">opencode.ai/zen/go/v1/models</span>, config id{" "}
        <span className="font-mono">opencode-go/&lt;model-id&gt;</span>.
      </p>
    </div>
  );
}
